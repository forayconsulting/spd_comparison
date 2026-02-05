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
