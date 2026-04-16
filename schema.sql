-- SPD MATRIX Session History Schema
-- Run this on Railway PostgreSQL to set up the database

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table (auto-created on first save)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analyses table - stores the three-phase outputs
CREATE TABLE IF NOT EXISTS analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    file_metadata JSONB NOT NULL,        -- [{filename, size, mimeType, uploadedAt}]
    summary_response TEXT,               -- Phase 1
    comparison_response TEXT,            -- Phase 2
    language_response TEXT               -- Phase 3
);

CREATE INDEX IF NOT EXISTS idx_analyses_user_created ON analyses(user_id, created_at DESC);

-- Chat messages table - linked to analysis
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_analysis ON chat_messages(analysis_id, created_at ASC);

-- Notes table - user annotations on analysis content
CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    tab VARCHAR(20) NOT NULL CHECK (tab IN ('summary', 'comparison', 'language')),
    anchor_text TEXT NOT NULL,               -- The exact highlighted text
    anchor_prefix TEXT,                      -- ~50 chars before for disambiguation
    anchor_suffix TEXT,                      -- ~50 chars after for disambiguation
    content TEXT NOT NULL,                   -- Note content (markdown supported)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_analysis ON notes(analysis_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update updated_at on analyses
DROP TRIGGER IF EXISTS update_analyses_updated_at ON analyses;
CREATE TRIGGER update_analyses_updated_at
    BEFORE UPDATE ON analyses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update updated_at on notes
DROP TRIGGER IF EXISTS update_notes_updated_at ON notes;
CREATE TRIGGER update_notes_updated_at
    BEFORE UPDATE ON notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Session Sharing Feature (added 2025-12-22)
-- ============================================

-- Shared analyses table - tracks email-based shares
CREATE TABLE IF NOT EXISTS shared_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_with_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL until user registers
    shared_with_email VARCHAR(255) NOT NULL,                     -- Email used to share
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(analysis_id, shared_with_email)
);

CREATE INDEX IF NOT EXISTS idx_shared_analyses_analysis ON shared_analyses(analysis_id);
CREATE INDEX IF NOT EXISTS idx_shared_analyses_email ON shared_analyses(shared_with_email);
CREATE INDEX IF NOT EXISTS idx_shared_analyses_user ON shared_analyses(shared_with_id);

-- Share tokens table - for shareable link access
CREATE TABLE IF NOT EXISTS share_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(64) UNIQUE NOT NULL,    -- Cryptographically random token
    expires_at TIMESTAMPTZ,               -- NULL = never expires
    max_uses INTEGER,                     -- NULL = unlimited
    use_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_tokens_token ON share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_share_tokens_analysis ON share_tokens(analysis_id);

-- Add authorship and threading to notes table
ALTER TABLE notes ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS parent_note_id UUID REFERENCES notes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notes_parent ON notes(parent_note_id);
CREATE INDEX IF NOT EXISTS idx_notes_author ON notes(author_id);

-- Migration: Assign existing notes to analysis owner (run once after adding author_id column)
-- This sets author_id for any notes that don't have one yet
UPDATE notes n
SET author_id = a.user_id
FROM analyses a
WHERE n.analysis_id = a.id
AND n.author_id IS NULL;

-- ============================================
-- Interactive Table View State (added 2026-02-05)
-- ============================================

-- Stores sort/filter/reorder/grouping state per tab
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS table_view_state JSONB;

-- ============================================
-- Action-Flagged Notes (added 2026-02-05)
-- ============================================

-- Note type: observational (default) or actionable (used as AI instructions in draft generation)
ALTER TABLE notes ADD COLUMN IF NOT EXISTS note_type VARCHAR(20) NOT NULL DEFAULT 'observational'
  CHECK (note_type IN ('observational', 'actionable'));

-- ============================================
-- Draft State (added 2026-02-05)
-- ============================================

-- Stores draft workspace state (selections, integrated column, draft content, phase)
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS draft_state JSONB;

-- ============================================
-- Analysis Mode (added 2026-03-20)
-- ============================================

-- Tracks which analysis mode was used (cross-plan, amendment-tracking, minutes-analysis, invoice-analysis)
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS analysis_mode VARCHAR(50) DEFAULT 'cross-plan';

-- ============================================
-- Admin & Vertex AI Settings (added 2026-03-16)
-- ============================================

-- Admin flag on users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Set initial admin
UPDATE users SET is_admin = true WHERE email = 'clayton@foray-consulting.com';

-- App-wide settings (key-value store for admin-configurable settings)
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES users(id)
);

-- Trigger to update updated_at on app_settings
DROP TRIGGER IF EXISTS update_app_settings_updated_at ON app_settings;
CREATE TRIGGER update_app_settings_updated_at
    BEFORE UPDATE ON app_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Multi-turn Chat Compaction (added 2026-03-19)
-- ============================================

-- Flag for compaction summary messages in chat history
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_compaction BOOLEAN DEFAULT false;

-- Allow 'system' role for compaction markers
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_role_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_role_check
  CHECK (role IN ('user', 'assistant', 'system'));

-- ============================================
-- Workspace Feature (added 2026-04-13)
-- ============================================

-- Workspaces - top-level organizational unit for shared document corpora
CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_active ON workspaces(is_active, created_at DESC);

DROP TRIGGER IF EXISTS update_workspaces_updated_at ON workspaces;
CREATE TRIGGER update_workspaces_updated_at
    BEFORE UPDATE ON workspaces FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Workspace members - associates users with workspaces + role
CREATE TABLE IF NOT EXISTS workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member'
      CHECK (role IN ('admin', 'member')),
    added_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_wm_user ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_wm_workspace ON workspace_members(workspace_id);

-- Workspace collections - named groupings of documents within a workspace
CREATE TABLE IF NOT EXISTS workspace_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    analysis_mode VARCHAR(50) NOT NULL DEFAULT 'cross-plan',
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wc_workspace ON workspace_collections(workspace_id);

DROP TRIGGER IF EXISTS update_wc_updated_at ON workspace_collections;
CREATE TRIGGER update_wc_updated_at
    BEFORE UPDATE ON workspace_collections FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Workspace documents - individual files within a collection
CREATE TABLE IF NOT EXISTS workspace_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES workspace_collections(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    filename VARCHAR(500) NOT NULL,
    original_filename VARCHAR(500) NOT NULL,
    size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    r2_key VARCHAR(1000) NOT NULL,
    r2_etag VARCHAR(100),
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wd_collection ON workspace_documents(collection_id);
CREATE INDEX IF NOT EXISTS idx_wd_workspace ON workspace_documents(workspace_id);

-- Link analyses to workspaces (NULL for personal analyses)
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS collection_id UUID REFERENCES workspace_collections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_analyses_workspace ON analyses(workspace_id) WHERE workspace_id IS NOT NULL;
