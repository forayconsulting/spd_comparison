So I've got this SPD Plan Comparison Agent I've been working on, and I am currently re-architecting it a little bit. So what you're going to see in this video is my transcription of how I would do this process manually after learning, building, trying. I'm sort of aligning on my critical path of what I want to do. And the way I want to do this is I want to basically automate or programmatize something that I would do manually.

[The user is viewing a local HTML file in their Chrome browser, titled "SPD Plan Comparison Agent". The page has a large empty area with the text "Drop files here or click to browse" and "Ready to compare plan documents".]

Okay, so what I'm going to do first is I'm going to go to...

[The user opens a new browser tab, types "gem" into the address bar, and clicks the autocomplete suggestion for "gemini.google.com".]

...you know, gemini.google.com, which is my Gemini platform. And, uh, I'm going to make sure that I'm using the Gemini 2.5 Pro model.

[The Gemini interface loads, showing "Hello, Clayton". The user clicks on the model selector, which already shows "2.5 Pro". The dropdown displays "2.5 Pro" and "Reasoning, math & code". The user closes the dropdown.]

Now, I aligned on Gemini instead of Claude because the ability to upload files, and specifically PDFs, has much higher limits. You can process 1,000 pages of PDF with a Gemini query and you get a million tokens of context. And with Claude, you get 100 pages of PDF and, depending on the model, you may get a million tokens of context, but your file upload is limited. You can only use a certain amount of that context through files.

So what I'm going to do is I'm going to go ahead and upload files.

[The user clicks the paperclip "Upload" icon next to the "Ask Gemini" prompt bar and selects "Upload files".]

I have all of these PDFs here.

[A macOS Finder window opens, displaying a folder named "plan_docs" containing 10 PDF files. The user selects all 10 files and clicks "Open".]

Um, something, you know, it's it's a it's a large amount of PDFs. I'm going to go ahead and upload them all.

[The 10 PDF files appear as "pills" above the chat input box as they upload.]

So they all come through. And then here's the first thing I'm going to do is I'm going to basically say, um, "I want you to comprehensively read all of the attached documents. You must return an organized overview of which documents are which, how they relate to one another, and the general domain, content, and structure of each."

[The user types this prompt into the "Ask Gemini" input field.]

And I'll just do that.

[The user hits Enter to send the prompt. The interface shows "Just a sec..." and then a "Show thinking" dropdown appears, cycling through various steps like "Analysis," "Considering Document Analysis," "Clarifying Document Purposes," "Delineating Document Context," etc.]

Okay, so I'm going to send that. And because there's a good amount of context, it's going to take a while. So this prompt, or something like it, is going to represent pretty much the first Gemini API call I'm going to make. I'm not going to be automating this process through the Gemini client, uh, but rather through the Gemini API. So my model is 2.5 Pro, you know, thinking is enabled. I'm going to use max thinking tokens, max max content, really max out the thinking. And it's going to take a while. It's it's doing all these thinking tokens, which I can expand here if desired.

[The user clicks on "Show thinking," and a detailed, multi-step plan appears. The user scrolls through it, showing steps like "Organizing Plan Documents," "Synthesizing Document Relationships," "Connecting Plan Structures," "Comparing Pension Structures," etc.]

And I think what I'd like to do is to take these thinking summaries here and surface them while the agent is thinking. It's going to take a while, and I'd love for my users to see those thinking summaries as they emerge. And so this first one is going to be just summarizing the documents. So we're going to take this all... It's going to take a while. But once it's done, we're going to spit it out in a tab of our interface called on the Summary tab.

[Gemini's response begins to generate. The user scrolls down as the text appears.]

And so here we go... "comprehensive overview of the documents, detailing what each one is, its general content, and how they relate to one another." "General Domain and Document Types." ... "They all relate to defined benefit pension plans for hospitality workers, specifically members of UNITE HERE and associated culinary and bartender unions." ... "These documents fall into two main categories: Summary Plan Description (SPD)... and Summary of Material Modifications (SMM)..."

[The user scrolls through the full response, which breaks down the uploaded files into five distinct plans: 1. Southern Nevada (Las Vegas) Plan, 2. San Francisco Plan, 3. Sacramento Plan, 4. San Diego Plan, and 5. UNITE HERE Northwest (Seattle, Tacoma, etc.) Plan. It correctly identifies which files are SPDs and which are SMMs for each plan.]

...Okay, so we're going to start with this. Now what I'm going to do... this is what we're going to... we're going to modify in this process. We're going to... we're going to copy the response...

[The user scrolls to the bottom of Gemini's response and clicks the "Copy" icon.]

...because I'm going to take this summary and I'm not only going to show it to the user, I'm going to use it within my next prompt to get more information. So, I'm going to start a new chat here...

[The user clicks the "New chat" icon in the top-left sidebar.]

...which is just going to represent a new Gemini, you know, API call with uh with no attendant context besides what I'm manually curating here. So, I'm going to go ahead and re-upload those files.

[The user clicks the "Upload" icon, selects "Upload files," and re-uploads the same 10 PDF files from the Finder window.]

Now, there's a reason that I'm doing this. Uh, I do not want prompt caching, document caching, because that seems to activate a a sort of like a a RAG capability where it's actually not refetching and rereading the entire context of all the PDFs, and I actually want it to re-evaluate the entire context of the PDFs every time. So we're doing a new a new file upload, a completely sort of stateless implementation as the second step of our process. So, as far as the UI, the user sees the summary, and then now we're working behind the scenes on the second tab, which is a a comparison.

And so I'm going to say, um, something like "Comprehensively read and analyze all of the attached documents. Here is a summary of the documents' content and structure:"

[The user types this text into the chat box. They then type "<summary>" on a new line, paste the large block of text copied from the first chat, and then type "</summary>" after it.]

And then I'm going to paste that whole response from the first one. Um, now it comes with some of these annoying little um numbers, which is which is a paste artifact of the citations in the previous one. And so it would be great if I could clean those up. I'm going to try it without cleaning them up for now and just see how it gets, because I don't know if it'll if it'll affect the outputs too badly. But then what I'll say is uh... "I want you to return a detailed and comprehensive table comparing elements across all plans. Columns should represent identified plans, and rows should represent identified procedural elements within the plans. The purpose of this table is to compare procedural elements across all plan documents at a glance."

[The user types this prompt into the chat box, after the closing `</summary>` tag.]

I'll say something like that, right? So there's a little bit of domain knowledge embedded in there, but I'm trying to keep it generic because I want pretty good outputs regardless of the nature of the specific plans or docs. And I'm trusting that the initial summary of the plans gives me what I want.

[The user hits Enter to send the second prompt. The interface shows "Just a sec..." and then the "Show thinking" steps, starting with "Analysis," "Constructing Comparison Table," "Outlining Procedural Elements," etc.]

...And again, I'm leveraging the the bare inference engine with no sort of uh mediating prompt caching or anything like that, which I think is really important and useful.

[Gemini's response generates, showing a table titled "Comparison of Pension Plan Procedural Elements". The user scrolls down the table, showing columns for "Procedural Element," "Southern Nevada (Las Vegas) Plan," "San Francisco Plan," "Sacramento Plan," "San Diego Plan," and "UNITE HERE Northwest Plan." The rows include "Plan Start Date," "Plan Administrator," "Recommended Application Timeline," "Deadline for Plan to Deny a Claim," etc.]

Okay, so what it's spitting out now is a pretty good comparison. So we got the procedural element and we got the different plans... We have the start date, administrator, recommended application timeline, all of these various elements. Um, this is really good. So this would become the content of the second tab.

So now, what I'm going to have to do... I'm going to open up a new tab because I'm going to actually combine uh content from both of the previous prompts in this third and final one, which is going to be pretty uh intense.

[The user opens a new browser tab, then clicks back to the Gemini tab, and then clicks the "New chat" icon in the sidebar to start a third chat.]

So then what I'll do is I'll I'll start a new a new prompt. And we're doing the same thing again. And by the way, that uh that previous um run would have rendered in the second tab, which is the plan comparison tab. And now here we go, the third tab is going to be a uh plan uh language comparison tab. And this is for lawyers who are reviewing SPDs and SMMs and comparing SPDs to uh give them the power to uh get at the specific changed language or comparison language between each of the uh each of the plans. And so what I would do here is I would say... I'm going to I'm going to copy some elements of my prompt up here.

[The user navigates to the second chat tab, "Pension Plan Comparison Table".]

So I'll say first, "Comprehensively read and analyze all the documents. Here's a summary of the content and structure." And so I'll just go ahead and copy-paste all of that.

[The user highlights and copies the first part of their second prompt. They then navigate back to the new (third) chat tab and paste it.]

Content and structure and the summary...

[The user navigates to the first chat tab, "Pension Plan Document Overview," and clicks the "Copy" icon to copy the entire summary response.]

...But then I'll also say, "Here is a breakdown of the uh... or here's a table comparing... comparing the uh various procedural elements... by plan."

[The user navigates back to the third chat, types the text above, and then types "<summary>" and "</summary>". They paste the copied summary (from the first chat) in between the tags. Then they type "<comparison>" and "</comparison>".]

...and then I will... in between the tags, I will place the...

[The user navigates to the second chat tab, "Pension Plan Comparison Table," scrolls down to the generated table, highlights the entire table, and copies it.]

...pasted table. Doesn't really paste very well, does it? But, you know, we'll kind of leave that as is.

[The user navigates back to the third chat and pastes the copied table text in between the `<comparison>` tags.]

Um, and then I'll say, "I want you to... create a more detailed version of this table which fully quotes and cites the language from each and every document which represents the procedural elements being compared. The purpose of this is to facilitate quick analysis of the plan document changes and amendments over time while citing the specific language applicable in as detailed a manner as possible."

[The user types this final part of the prompt after the closing `</comparison>` tag.]

Okay, so I'm going to send that. And so we're building progressive... we're progressively engineering the context build. We're doing in new chats, if you will, new new instantiated contexts each time, and leveraging the full analytical force of that Gemini model each time.

[The user hits Enter to send the third prompt. The "Show thinking" steps appear, e.g., "Elaborating the Goal," "Refining the Approach," "Extracting Specific Details," etc. The user expands "Show thinking" to reveal the detailed plan.]

And so this third tab is now filling out. So the idea in the user interface is that the user's... through our platform, this SPD agent... really upload their plan docs once, and then they sort of watch the thinking process populate each of the tabs separately, but with the sort of progressive context engineering happening automatically in the background through the uh the API calls that are being made. So that's the goal.

So we'll see how it gets. And again, for each of these tabs, I would love to have these sort of thinking summaries surfaced so that, dot dot dot, as as they go.

[The third response begins to generate, titled "Detailed Comparison of Pension Plan Procedures". It is a table similar to the previous one, but the cells are filled with long, quoted passages from the documents.]

And so here we go. You can see it is running all this. So the "Plan Start Date," you have the language here. "Plan Administrator," you have the language there. I don't see a citation. Maybe as it... okay, as it's as it's writing, the citation will be coming in, I assume.

[The user scrolls down, and indeed, citations like "Page 1," "Page 71," "Page 20," etc., appear at the end of the quotes in the table cells.]

So, yep, there's a citation: Page 1, Page 1, Page 71, Page 20... So this is great. This is this is what you need. And then, of course, in Gemini, you can export to Sheets.

[The user scrolls to the bottom of the generated table and clicks the "Export to Sheets" icon. A new browser tab opens with an "Untitled" Google Sheet, populating it with the table data.]

Now, if I did this... this is a little different than what we're going to do... but if I do this, and then I open it in Sheets... um, I should see... let's see what the citations look like here. Yeah, there aren't citations here. So that that would be one of the key things we would need to figure out is... um, through the API, if we're doing this kind of analysis, how are we... can we interpret those citations meaningfully? And can we get them... get them back... um, in a in a human-readable way where that's that's linked very nicely? Uh, the other sort of question would be if we could prompt it differently uh to to do that a bit differently. So I might... let me try to rerun this prompt...

[The user navigates back to the third Gemini chat tab and clicks the "Edit" (pencil) icon next to their prompt.]

...and say, uh, "Your citations must be in parentheses behind each and every statement cited and must be structured as follows: (<filename>, <page_number>, <paragraph_number>)".

[The user types this additional instruction into their prompt.]

...within the page. Something like that. And let's update that.

[The user clicks the "Update" button to re-submit the edited prompt.]

If we ran that again, that might be another approach for us to get this prompting to come out... get that citation to come out more interpretably for our purposes. So we'll wait and see how that comes out. But that's the approach I'd like to take, and I think if we can refactor the existing SPD Plan Comparison Agent to do that... um, some of the efficiency gains that we would... or the efficiencies that we would lose, rather, would be, you know, we are uh feeding all the PDFs three times for any one query. We are not using prompt caching, so we're consuming a lot more tokens. But I have already tested prompt caching, multi-turn, like multiple different ways of testing this, and the results, unfortunately, are just... are pretty abysmal. It's very low quality, um, very low um reliability. So you run the same doc twice and it'll get wildly different results. And this process of what I'm doing here is much more uh effective.

[The new response finishes generating. The user scrolls down, and the citations are now in the format requested, e.g., "(LV-Summary_July 2020 (E).pdf, Page 2, Paragraph 4)".]

So yeah, you can see that way of talking about the citations is very clear. So it'll... it'll say, "The Plan was originally established..." blah, blah, blah, and then it'll quote the document title, page 2, paragraph 4. I think this is what I'd like to do. It's very interpretable. So that would be a great way to do it, actually. And then uh the theory here is if we do this, we are consuming more cost, but because this activity of uh plan doc comparison is actually relatively rare, and it's not like something that's happening every single day, um we can still save a ton of time and money by having this process automated. We're just going to have to spend... It's going to be a fairly computationally expensive process, but that's fine because we're still saving thousands of times the amount of hours and money, uh or maybe hundreds... hundreds... than uh than we would if we had humans doing it. Of course. So we... we would rather spend the money to get this as robust as possible. All right.