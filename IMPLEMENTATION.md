# Buddy Implementation Plan

This document outlines the detailed implementation plan for the Buddy Chrome extension, including technical specifications, development phases, and task tracking.

## Project Structure

```
buddy/
├── manifest.json                 # Chrome extension manifest
├── src/
│   ├── background/              # Background service worker
│   │   ├── service-worker.js
│   │   └── api/
│   │       ├── anthropic.js     # Anthropic API integration
│   │       └── storage.js       # Chrome storage wrapper
│   ├── content/                 # Content scripts
│   │   ├── buddy-icon.js        # Draggable icon implementation
│   │   ├── sidebar.js           # Sidebar management
│   │   ├── page-parser.js       # Page content extraction
│   │   └── text-actions.js      # Text selection/insertion actions
│   ├── popup/                   # Extension popup (if needed)
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   ├── sidebar/                 # Sidebar interface
│   │   ├── sidebar.html
│   │   ├── sidebar.js
│   │   ├── sidebar.css
│   │   └── components/
│   │       ├── chat.js          # Chat interface
│   │       ├── tasks.js         # Task management
│   │       ├── conversations.js # Conversation history
│   │       └── markdown.js      # Markdown rendering
│   ├── management/              # Management interface
│   │   ├── management.html
│   │   ├── management.js
│   │   ├── management.css
│   │   └── components/
│   │       ├── api-config.js    # API key management
│   │       ├── task-editor.js   # Custom task creation/editing
│   │       ├── blacklist.js     # Site blacklist management
│   │       └── settings.js      # General settings
│   ├── shared/                  # Shared utilities
│   │   ├── constants.js         # App constants
│   │   ├── utils.js             # General utilities
│   │   ├── task-system.js       # Task execution engine
│   │   └── storage-manager.js   # Storage abstraction layer
│   └── assets/                  # Static assets
│       ├── icons/               # Extension icons
│       ├── fonts/               # Custom fonts
│       └── images/              # UI images
├── tests/                       # Test files
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/                        # Documentation
├── PROJECT.md                   # Project overview
├── IMPLEMENTATION.md            # This file
├── CLAUDE.md                    # Claude AI assistant instructions
└── package.json                # Development dependencies
```

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2)

**Priority: High**

1. **Chrome Extension Setup**

   - Create manifest.json with required permissions
   - Set up basic file structure
   - Configure development environment

2. **Storage System**

   - Implement Chrome storage wrapper
   - Define data schemas for conversations, tasks, settings
   - Create storage management utilities

3. **Basic UI Framework**
   - Create draggable icon on right edge
   - Implement basic sidebar with resizing
   - Set up page content pushing behavior

### Phase 2: Task System Foundation (Week 2-3)

**Priority: High**

4. **Task Engine**

   - Design task definition schema
   - Implement task execution pipeline
   - Create built-in tasks (summarize, rephrase)

5. **Content Extraction**

   - Implement page content parser
   - Handle text selection detection
   - Add smart content filtering

6. **Anthropic Integration**
   - Set up API client
   - Implement conversation context management
   - Add error handling and rate limiting

### Phase 3: User Interface (Week 3-4)

**Priority: Medium**

7. **Chat Interface**

   - Create conversation display
   - Implement markdown rendering
   - Add message history scrolling

8. **Task Interface**

   - Build task selection UI
   - Create task execution feedback
   - Implement output action buttons

9. **Management Interface**
   - Design settings modal
   - Create API key configuration
   - Build custom task editor

### Phase 4: Advanced Features (Week 4-5)

**Priority: Medium-Low**

10. **Enhanced Functionality**

    - Implement text replacement actions
    - Add cursor insertion capability
    - Create site blacklist management

11. **User Experience Polish**

    - Add loading states and animations
    - Implement keyboard shortcuts
    - Enhance error messaging

12. **Data Management**
    - Add conversation export/import
    - Implement data cleanup utilities
    - Create backup/restore functionality

## Technical Specifications

### Chrome Extension Manifest (v3)

```json
{
  "manifest_version": 3,
  "name": "Buddy",
  "version": "1.0.0",
  "description": "AI assistant Chrome extension for content interaction",
  "permissions": ["storage", "activeTab", "scripting"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "src/background/service-worker.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/buddy-icon.js", "src/content/sidebar.js"],
      "css": ["src/content/buddy.css"]
    }
  ],
  "action": {
    "default_popup": "src/popup/popup.html"
  }
}
```

### Data Schemas

#### Task Schema

```javascript
{
  id: string,
  name: string,
  description: string,
  inputType: 'page' | 'selection',
  prompt: string,
  isBuiltIn: boolean,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

#### Conversation Schema

```javascript
{
  id: string,
  title: string,
  messages: [
    {
      id: string,
      type: 'user' | 'assistant' | 'task',
      content: string,
      taskId?: string,
      taskOutput?: string,
      timestamp: timestamp
    }
  ],
  createdAt: timestamp,
  updatedAt: timestamp
}
```

#### Settings Schema

```javascript
{
  apiKey: string (encrypted),
  sidebarWidth: number,
  iconPosition: number,
  blacklistedSites: string[],
  defaultTasks: string[],
  conversationRetention: number
}
```

### API Integration

#### Anthropic Claude Integration

```javascript
class AnthropicAPI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.anthropic.com/v1';
  }

  async sendMessage(messages, systemPrompt) {
    // Implementation for Anthropic API calls
    // Handle context management and conversation history
  }

  async processTask(taskPrompt, content, conversationHistory) {
    // Process task with contextual memory
  }
}
```

## Current Development Status

### Completed Tasks ✓

- Project planning and specification
- Detailed technical architecture design
- Documentation structure creation

### In Progress 🔄

- Implementation plan documentation

### Pending Tasks 📋

#### High Priority

- [ ] Create Chrome extension manifest and basic file structure
- [ ] Create CLAUDE.md referencing both files and our discussions

#### Medium Priority

- [ ] Implement draggable right-edge icon with up/down positioning
- [ ] Build resizable sidebar that pushes page content
- [ ] Create management interface for API keys, tasks, and blacklist
- [ ] Implement Chrome storage for conversations, tasks, and settings
- [ ] Build chat interface with markdown support
- [ ] Implement task system with built-in tasks (summarize, rephrase)
- [ ] Add Anthropic API integration with contextual memory

#### Low Priority

- [ ] Implement task output actions (copy, replace, insert at cursor)

## Development Guidelines

### Code Standards

- Use ES6+ JavaScript features
- Follow Chrome extension best practices
- Implement proper error handling and logging
- Use semantic versioning for releases

### Security Considerations

- Store API keys securely in Chrome storage
- Validate all user inputs
- Implement content security policy
- Use HTTPS for all API communications

### Performance Optimization

- Lazy load sidebar components
- Implement efficient content parsing
- Cache conversation data appropriately
- Minimize memory footprint

### Testing Strategy

- Unit tests for core utilities and API integration
- Integration tests for Chrome extension functionality
- End-to-end tests for user workflows
- Manual testing across different websites

## Deployment Process

1. **Development Build**

   - Local testing with unpacked extension
   - Development API keys and debugging

2. **Staging Build**

   - Minified code and optimized assets
   - Production API endpoints
   - Beta testing with limited users

3. **Production Release**
   - Chrome Web Store submission
   - Production monitoring and analytics
   - User feedback collection and iteration

## Future Enhancements

### Version 2.0 Features

- Multiple LLM provider support
- Advanced task templates and marketplace
- Image and media content processing
- Integration with external tools and services

### Long-term Vision

- Community-driven task ecosystem
- Enterprise features and team collaboration
- Advanced AI capabilities and custom model support
- Cross-browser extension support

---

_This implementation plan serves as the primary reference for development progress and technical decisions. Update this document as the project evolves._
