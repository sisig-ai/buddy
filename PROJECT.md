# Buddy

Buddy is a Chrome browser extension that acts as an AI agent, performing actions on the user's browser using definable Tasks, and allowing the user to chat with an LLM.

## Overview

Buddy provides an integrated AI assistant experience directly in the browser, enabling users to interact with content through pre-defined tasks and natural conversation. The extension focuses on simplicity and immediate utility while maintaining extensibility for power users.

## Core Features

### Tasks System

A Task is a simple workflow that takes an input, runs it through an LLM, and returns an output. Tasks can be triggered through the sidebar interface and support multiple output actions.

**Built-in Tasks:**

- **Summarize this page**: Takes visible page content and provides a concise summary
- **Rephrase selected text**: Improves or modifies selected text based on user needs
- **Additional basic tasks**: To be determined based on common use cases

**Custom Tasks:**

- Users can create, edit, and manage custom tasks
- Tasks define input source (full page or selected text) and processing prompt
- Future: JSON export/import for task sharing

### Input Sources

- **Full page content**: Captures currently visible text on the page
- **Selected text**: Uses text that user has highlighted
- **Smart filtering**: Focuses on main content, ignoring navigation and ads

### Output Actions

When a task completes, users can:

- **View in chat**: Results display in the conversation interface
- **Copy to clipboard**: One-click copying for external use
- **Replace selected text**: Automatically replaces the original selection
- **Insert at cursor**: Adds content at the current cursor position

## User Interface

### Always-On Icon

- Small "Buddy" button positioned on the right edge of the screen
- Draggable vertically along the right edge for user positioning
- Visible on all websites by default (with blacklist capability)
- Click to open/close the sidebar

### Sidebar Interface

- **Behavior**: Pushes page content to the left (doesn't overlay)
- **Size**: Resizable width, approximately 350-400px default
- **Sections**:
  - Available tasks list
  - Previous conversations history
  - Manage button access

### Chat Interface

- **Style**: Similar to Claude with clear message separation
- **Features**: Full markdown support for rich text display
- **Context**: Maintains contextual memory within conversations
- **History**: Conversations persist and sync across Chrome instances

### Management Interface

- **Access**: Modal opened via Manage button
- **API Configuration**: Secure storage and management of Anthropic API keys
- **Task Management**: Create, edit, and delete custom tasks
- **Site Control**: Blacklist management for website restrictions
- **Settings**: General preferences and configuration options

## Technical Architecture

### LLM Integration

- **Provider**: Anthropic Claude (direct API calls)
- **Authentication**: User-provided API keys stored in Chrome storage
- **Context Management**: Maintains conversation context including original task content
- **Security**: Clear API key option and limited-scope key recommendations

### Data Storage

- **Method**: Chrome Storage API for persistence and sync
- **Data Types**: Conversations, custom tasks, API keys, user preferences, site blacklists
- **Retention**: Conversations kept until user deletion
- **Sync**: Data syncs across user's Chrome instances

### Browser Integration

- **Permissions**: Access to all websites with user-controlled blacklist
- **Content Access**: Reads visible page content for task processing
- **DOM Interaction**: Handles text selection and cursor positioning for output actions
- **Extension Architecture**: Standard Chrome extension with content scripts and background service

## Design Principles

1. **Simplicity First**: Start with essential features, add complexity gradually
2. **User Control**: Provide granular control over behavior and data
3. **Privacy Focused**: Local data storage with user-managed API keys
4. **Extensible**: Design for future enhancements without breaking existing functionality
5. **Unobtrusive**: Enhance browsing without interfering with website functionality

## Future Considerations

- Task marketplace or sharing ecosystem
- Additional LLM provider support
- Advanced input sources (images, audio, etc.)
- Integration with external tools and services
- Advanced conversation management features
