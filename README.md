# 🤖 AI Browser Automation Agent

## 🎯 Description

An intelligent browser automation agent powered by LLM that can perform web interactions using natural language commands. Built with a **hybrid approach** - DOM selectors for reliability, coordinate fallbacks for flexibility, and viewport optimization for token efficiency.

Simply describe what you want to do in plain English, and watch the AI navigate, fill forms, click buttons, and complete tasks automatically!

## DEMO video

[![Watch the demo](https://img.youtube.com/vi/enWKFrAQvU4/maxresdefault.jpg)](https://www.youtube.com/watch?v=enWKFrAQvU4)

---

## ✨ Key Features

- 🧠 AI-powered natural language interface
- 🎯 Hybrid automation (DOM-first, coordinate fallback)
- 📸 Token-optimized visual processing (efficient screenshots & DOM filtering)
- 🛠️ Smart tools: clicking, form filling, scrolling, navigation, verification

## ⚙️ Configuration Options

### Prerequisites

- Node.js 18+ and pnpm
- Google Generative AI API key
- Playwright browsers

### Setup

```bash
# Clone the repo
git clone https://github.com/rohit-kadam-springct/browserly.git
cd ai-browser-automation

# Install dependence
pnpm install

# Create environment file
cp .env.example .env

# Add your Google AI API key
echo "GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here" >> .env

# Run the script
pnpm start
```

### Environment Variables

```bash
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
```

### Browser Settings

```typescript
// Customize in browserAgent.ts
const browserConfig = {
  viewport: { width: 800, height: 520 },
  slowMo: 300,                          // Slow down for visibility
  headless: false,                      # Show browser
  timeout: 10000                        # Page load timeout
}
```

---

## 🔄 Future Scope & Roadmap

- [] Separate tools into separate file
- [] Create a wrapper class for browser handling
- [] Handle complex task like buying items
- [] Need a memory to store the authentication data

---
