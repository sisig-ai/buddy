# Buddy - AI Assistant Chrome Extension

**An intelligent Chrome extension that brings AI-powered assistance directly to your browser, featuring conversational AI, content analysis, and seamless web integration.**

> 🤖 **Co-authored with [Claude Code](https://claude.ai/code)** - This entire project was developed through an AI-human collaboration, showcasing the power of AI-assisted development.

## ✨ Features

### 🎯 AI-Powered Tasks

- **Page Summarization** - Get concise summaries of any webpage content
- **Text Rephrasing** - Improve and refine selected text with AI assistance
- **Conversation Continuation** - Ask follow-up questions with full context awareness

### 🔧 Smart Interface

- **Draggable Icon** - Convenient right-edge icon that can be positioned anywhere vertically
- **Resizable Sidebar** - Customizable width that intelligently pushes page content
- **Contextual Chat** - Seamless conversation flow after executing tasks

### ⚙️ Comprehensive Settings

- **API Key Management** - Secure storage with connection testing
- **Site Blacklist** - Disable the extension on specific websites
- **Customization** - Adjust sidebar width and conversation history limits
- **Privacy-First** - All data stays in your browser

### 🛡️ Privacy & Security

- **Local Storage** - All conversations and settings stored in Chrome's sync storage
- **No External Servers** - Direct API communication with Anthropic
- **Blacklist Control** - Complete control over where the extension operates

## 🚀 Installation

### Prerequisites

- Chrome browser (or Chromium-based browser)
- [Anthropic API key](https://console.anthropic.com/) for AI functionality

### Development Setup

1. **Clone the repository**

   ```bash
   git clone <your-repo-url>
   cd buddy
   ```

2. **Install dependencies**

   ```bash
   bun install
   # or npm install
   ```

3. **Build the extension**

   ```bash
   bun run build
   ```

4. **Load in Chrome**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

### Configuration

1. **Get your API key** from [Anthropic Console](https://console.anthropic.com/)
2. **Open Buddy** by clicking the icon on any webpage
3. **Access Settings** via the ⚙️ button in the sidebar
4. **Configure your API key** and test the connection
5. **Customize** sidebar width and other preferences

## 📖 Usage

### Quick Start

1. **Click the Buddy icon** on the right edge of any webpage
2. **Try a quick task**:
   - Click "📄 Summarize this page" for content analysis
   - Select text and click "✏️ Rephrase selected text" for improvements
3. **Continue the conversation** by typing follow-up questions in the chat

### Advanced Usage

- **Blacklist sites** where you don't want Buddy to appear
- **Adjust sidebar width** for your preferred layout
- **Manage conversation history** with customizable retention limits
- **Use keyboard shortcuts** like Enter to send messages

## 🛠️ Development

### Project Structure

```
buddy/
├── src/
│   ├── background/          # Service worker for API calls
│   ├── content/             # Main extension logic
│   └── shared/             # Shared types and utilities
├── dist/                   # Built extension files
├── manifest.json          # Extension manifest
└── README.md              # This file
```

### Key Technologies

- **TypeScript** - Type-safe development
- **Bun** - Fast JavaScript runtime and bundler
- **Chrome Extension Manifest v3** - Latest extension API
- **Anthropic Claude API** - AI conversation capabilities

### Build Commands

```bash
# Development with watch mode
bun run dev

# Production build
bun run build

# Code quality
bun run lint
bun run format

# Testing
bun test
```

### Code Quality

The project includes:

- **ESLint** for code linting
- **Prettier** for code formatting
- **Husky** for pre-commit hooks
- **TypeScript** for type checking

## 🤖 AI Collaboration

This project is a testament to **AI-human collaboration** in software development:

### Claude Code Contributions

- **Architecture Design** - Planned the entire extension structure
- **Feature Implementation** - Wrote the core functionality
- **Problem Solving** - Debugged CORS issues and API integration
- **Code Quality** - Implemented linting, formatting, and best practices
- **Documentation** - Created comprehensive docs and comments

### Development Process

1. **Collaborative Planning** - Discussed requirements and architecture
2. **Iterative Development** - Built features incrementally with feedback
3. **Real-time Problem Solving** - Addressed issues as they arose
4. **Code Review** - Ensured quality and maintainability
5. **Documentation** - Created thorough documentation

> **"This project demonstrates how AI can be a powerful development partner, handling everything from initial architecture to final implementation while maintaining high code quality standards."**

## 🔧 Technical Details

### Chrome Extension Architecture

- **Manifest v3** compliance for modern Chrome extensions
- **Background Service Worker** for API communication and data processing
- **Content Scripts** for webpage interaction and UI injection
- **Chrome Storage API** for persistent settings and conversations

### API Integration

- **Anthropic Claude API** with proper browser headers
- **Error handling** for network issues and API limits
- **Conversation context** maintained across interactions
- **Token management** for efficient API usage

### Privacy & Security

- **No external tracking** - All data stays in your browser
- **Secure API key storage** - Uses Chrome's encrypted sync storage
- **Content isolation** - Extension runs in isolated context
- **Permission control** - Minimal required permissions

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🤝 Contributing

Contributions are welcome! This project showcases AI-assisted development, and we're open to:

- **Feature suggestions** - Ideas for new AI capabilities
- **Bug reports** - Help us improve the extension
- **Code improvements** - Optimizations and enhancements
- **Documentation** - Better guides and examples

### Development Guidelines

1. Follow the existing TypeScript patterns
2. Maintain the AI-first development approach
3. Ensure all changes pass linting and formatting
4. Test thoroughly in Chrome extension environment

## 🔗 Links

- **[Anthropic Console](https://console.anthropic.com/)** - Get your API key
- **[Claude Code](https://claude.ai/code)** - AI development assistant
- **[Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)** - Official Chrome extension docs

---

**Built with ❤️ through AI-human collaboration**

_This README itself was crafted by Claude Code, demonstrating AI's capability in technical writing and documentation._
