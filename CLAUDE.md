# Claude AI Assistant Instructions for Buddy Project

## Project Overview

Buddy is a Chrome browser extension that acts as an AI assistant, enabling users to interact with web content through definable tasks and natural conversation. This project focuses on creating a simple, powerful tool that integrates seamlessly into the browsing experience.

**Key References:**

- **PROJECT.md**: Complete project specifications and feature overview
- **IMPLEMENTATION.md**: Detailed technical implementation plan and development tracking

## Architecture Decisions Made

Through collaborative design sessions, the following key architectural decisions were established:

### Technical Foundation

- **LLM Provider**: Anthropic Claude via direct API calls (simple approach for v1)
- **Data Storage**: Chrome Storage API for persistence and cross-device sync
- **Extension Type**: Chrome Extension Manifest v3 with content scripts and background service worker
- **Permissions**: All websites by default with user-controlled blacklist

### User Interface Design

- **Icon**: Draggable along right screen edge, vertically repositionable
- **Sidebar**: Resizable width, pushes page content (doesn't overlay)
- **Chat Interface**: Claude-style conversation with full markdown support
- **Management**: Modal interface for settings, API keys, and task management

### Task System Architecture

- **Built-in Tasks**: Ships with essential tasks (summarize page, rephrase text)
- **Custom Tasks**: User-created tasks with JSON export/import capability
- **Input Sources**: Full page content or selected text
- **Output Actions**: Copy to clipboard, replace selection, insert at cursor
- **Context Management**: Maintains conversation context including original task content

### Data Management Strategy

- **Conversations**: Persistent with sync, kept until user deletion
- **API Keys**: Secure storage with clear/reset options
- **Tasks**: Custom tasks stored locally with future sharing capability
- **Settings**: User preferences including sidebar width, icon position, site blacklists

## Development Approach

### Implementation Philosophy

1. **Simplicity First**: Start with core features, add complexity gradually
2. **User Control**: Granular control over behavior and data
3. **Privacy Focused**: Local storage with user-managed API keys
4. **Extensible Design**: Built for future enhancements without breaking changes

### Current Development Status

- ✅ Project specification and architecture complete
- ✅ Technical implementation plan documented
- ✅ Core Chrome extension functionality implemented
- ✅ Version 1.1.4 released with major feature enhancements

## Code Implementation Guidelines

### File Organization

Follow the structure defined in IMPLEMENTATION.md:

```
src/
├── background/     # Service worker and API integration
├── content/        # Content scripts for page interaction
├── sidebar/        # Main UI components
├── management/     # Settings and configuration
└── shared/         # Utilities and common code
```

### Key Technical Requirements

#### Chrome Extension Manifest

- Use Manifest v3 for modern Chrome compatibility
- Request minimal necessary permissions
- Support all websites with content script injection

#### Storage Implementation

- Use chrome.storage.sync for cross-device data
- Implement proper data schemas for conversations, tasks, settings
- Include encryption for sensitive data like API keys

#### API Integration

- Direct calls to Anthropic Claude API
- Implement proper error handling and rate limiting
- Maintain conversation context across task executions

#### Content Script Functionality

- Page content extraction focusing on visible text
- Text selection detection and manipulation
- Cursor position tracking for text insertion
- Sidebar injection without breaking page layouts

### User Experience Requirements

#### Sidebar Behavior

- Must push page content, never overlay
- Resizable width with drag handles
- Smooth animations for open/close states
- Responsive design for different screen sizes

#### Task Execution Flow

1. User selects task from sidebar
2. Extract appropriate content (page or selection)
3. Send to LLM with contextual prompt
4. Display result in chat interface
5. Offer output actions (copy, replace, insert)

#### Management Interface

- Modal overlay for settings access
- Secure API key input with validation
- Custom task editor with prompt testing
- Site blacklist management with domain validation

## Testing Strategy

### Development Testing

- Test extension loading and manifest validation
- Verify content script injection across different websites
- Test API integration with Anthropic Claude
- Validate data persistence and sync functionality

### User Experience Testing

- Test sidebar behavior on various website layouts
- Verify task execution across different content types
- Test conversation context maintenance
- Validate output actions (copy, replace, insert)

### Edge Case Handling

- Test on websites with complex layouts or overlays
- Handle API rate limiting and error responses
- Test with various text selections and page content
- Verify behavior on restricted or HTTPS sites

## Future Development Considerations

### Version 1.0 Scope

Focus on core functionality:

- Basic task system with built-in tasks
- Functional chat interface with context
- Secure API key management
- Essential output actions

### Future Enhancements (Post v1.0)

- Additional LLM provider support
- Task marketplace and sharing
- Advanced input sources (images, audio)
- Integration with external tools
- Team collaboration features

## Important Implementation Notes

### Security Best Practices

- Never expose API keys in extension code
- Validate all user inputs for XSS prevention
- Use Content Security Policy appropriately
- Implement secure communication between scripts

### Performance Optimization

- Lazy load sidebar components
- Efficient DOM manipulation for content extraction
- Minimal memory footprint for content scripts
- Appropriate caching for conversation data

### Cross-Site Compatibility

- Handle various website architectures (SPAs, traditional sites)
- Respect website CSP policies where possible
- Graceful degradation for unsupported sites
- Minimal interference with website functionality

## Development Workflow

### Phase-Based Implementation

Follow the phases outlined in IMPLEMENTATION.md:

1. **Phase 1**: Core infrastructure and storage
2. **Phase 2**: Task system and API integration
3. **Phase 3**: User interface and chat functionality
4. **Phase 4**: Advanced features and polish

### Code Quality Standards

- Use modern JavaScript (ES6+) features
- Implement comprehensive error handling
- Follow Chrome extension best practices
- Maintain clean, readable code with proper documentation

### Version Control Strategy

- Use semantic versioning (1.0.0, 1.1.0, etc.)
- **IMPORTANT**: Bump version in both `package.json` and `manifest.json` before each build
- Create feature branches for major components
- Regular commits with descriptive messages
- Tag releases with version numbers

---

**Remember**: This project emphasizes user control, privacy, and simplicity. Every feature should enhance the browsing experience without being intrusive or compromising user data security.

- remember to rebuild the extension whenever you make changes
- remember to bump the version every time we build. use semantic versioning

## Implemented Features (v1.1.4)

### Core Functionality

- **Direct Chat Interface**: Users can type messages without selecting a task first
- **Tool-Calling Capability**: LLM can read current page content using the `read_page_content` tool
- **Conversation Management**:
  - Persistent conversation storage with individual keys to avoid Chrome storage limits
  - Conversation history panel with modern card-based UI
  - Automatic cleanup of old conversations
  - Tasks create new conversations instead of continuing existing ones

### User Interface Enhancements

- **Icon-Based Task Chooser**:
  - 4x2 grid layout showing up to 7 tasks with icons
  - Customizable task icons (emoji) and colors
  - "Show more" modal for additional tasks
  - Hover tooltips showing task names
  - Smooth animations and visual feedback
- **Modern Design Elements**:
  - Hide buddy icon when sidebar is open
  - Resizable sidebar that pushes page content
  - Markdown rendering for assistant messages using the `marked` library
  - Welcome message displayed as initial assistant message
  - Auto-scrolling to bottom when LLM responds

### Advanced Features

- **Model Selection**:
  - Customizable Claude model selection in admin page
  - Fetches available models from Anthropic API
  - Default fallback models if API is unavailable
  - Model preference persists across sessions
- **Debug Mode**:
  - Toggleable debug messages (yellow bubbles)
  - Shows tool calls and context information
  - OFF by default for cleaner experience
  - Setting persists across sessions
- **Settings Management**:
  - Comprehensive settings page for API configuration
  - Site blacklist management
  - Custom task creation with icon and color selection
  - Data export/import functionality

### Technical Improvements

- **Storage Architecture**:
  - Migration from array-based to individual conversation storage
  - Automatic migration for existing users
  - Efficient storage usage within Chrome's limits
- **API Integration**:
  - Automatic API initialization when needed
  - Shared API key across all tasks and features
  - CORS headers for direct browser access
  - Error handling and graceful fallbacks
- **Build System**:
  - Bun bundler for TypeScript compilation
  - Modular file structure with ES6 modules
  - IIFE bundles for Chrome extension compatibility

### Bug Fixes & Optimizations

- Fixed storage quota exceeded errors
- Fixed tab context issues for content script communication
- Fixed API key sharing between tasks
- Improved markdown rendering with proper spacing
- Enhanced auto-scrolling reliability
- Better contrast calculation for task icons

## Development Notes

### Key Files Modified

- `src/sidebar/sidebar.js`: Main UI logic and task grid implementation
- `src/sidebar/sidebar.html`: Updated structure for icon-based tasks
- `src/sidebar/sidebar.css`: Modern styling with animations
- `src/background/service-worker.ts`: Enhanced API handling and tool support
- `src/shared/storage-manager.ts`: Individual conversation storage
- `src/management/management.js`: Model selection and debug toggle
- `src/shared/types.ts`: Updated interfaces for new features
- `src/background/api/anthropic.ts`: Model selection and API improvements

### Chrome Extension Specifics

- Uses Manifest V3 for modern Chrome compatibility
- Service worker handles background tasks and API calls
- Content scripts inject sidebar and handle page interactions
- Message passing between components for proper context
- Web accessible resources for sidebar and management pages
