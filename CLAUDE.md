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
- 🔄 Ready to begin Chrome extension development

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
- Create feature branches for major components
- Regular commits with descriptive messages
- Tag releases with version numbers

---

**Remember**: This project emphasizes user control, privacy, and simplicity. Every feature should enhance the browsing experience without being intrusive or compromising user data security.
