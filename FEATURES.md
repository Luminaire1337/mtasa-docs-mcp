# MTA:SA Documentation MCP Server - Features & Roadmap

## 🎉 Current Features (v2.0.0)

### Core Functionality

- ✅ **8 MCP Tools** for comprehensive MTA:SA documentation access
- ✅ **Vector Similarity Search** using SQLite-vec for intelligent function discovery
- ✅ **Smart Keyword Expansion** - maps aliases like "db" → database functions, "gui" → CEGUI functions
- ✅ **Intelligent Caching** - SQLite database with 30-day cache duration
- ✅ **Deprecation Detection** - automatically warns about deprecated functions (e.g., getLocalPlayer → localPlayer)
- ✅ **MCP Prompt** - Resource structure guide teaching meta.xml and predefined variables
- ✅ **Background Loading** - server starts instantly, functions load asynchronously
- ✅ **Multi-package Manager Support** - works with pnpm, npm, yarn, bun

### Available Tools

1. `search_mtasa_functions` - Search by name with filters
2. `find_mtasa_functions_for_task` - Semantic search for features (e.g., "spawn vehicle", "gui window")
3. `get_mtasa_function_docs` - Full documentation with examples
4. `get_mtasa_function_examples` - Quick code reference
5. `get_multiple_mtasa_function_docs` - Batch documentation fetching
6. `list_mtasa_functions_by_category` - Browse by category
7. `get_mtasa_cache_stats` - Cache statistics
8. `clear_mtasa_cache` - Cache management

### Technical Features

- ✅ Modern TypeScript codebase
- ✅ esbuild bundling with minification
- ✅ Single 574KB executable
- ✅ Comprehensive HTML parsing from MTA:SA Wiki
- ✅ Extracts: description, syntax, parameters, returns, examples, related functions

---

**⚠️ Note:**
The `parseDocumentation` function still needs further improvement. The data it returns (description, syntax, parameters, examples, related functions, etc.) is not always 100% accurate or perfectly formatted. Some edge cases and wiki inconsistencies remain. See AGENTS.md for architectural notes and update plans.

---

## 🚀 Planned Features

### High Priority

- [ ] **Function Signature Autocomplete** - Generate Lua function signatures with parameter types
- [ ] **Event Handler Templates** - Pre-built templates for common events (onPlayerJoin, onClientResourceStart, etc.)
- [ ] **Code Snippet Generation** - Generate boilerplate code for common patterns
- [ ] **Related Functions Graph** - Show relationships between functions visually
- [ ] **Element Type Detection** - Suggest functions based on element types (vehicle, player, object)
- [ ] **Server/Client Side Checker** - Validate if function can be used on current side

### Documentation Enhancements

- [ ] **Wiki Page Versioning** - Track MTA:SA version compatibility
- [ ] **Parameter Type Validation** - Extract and validate parameter types
- [ ] **Return Type Documentation** - Detailed return value structure
- [ ] **Common Pitfalls** - Extract "Important Note" sections from wiki
- [ ] **Performance Tips** - Highlight performance-related notes
- [ ] **Security Warnings** - Flag security-sensitive functions

### Smart Features

- [ ] **Function Usage Examples from GitHub** - Scrape real-world usage from public repos
- [ ] **Error Message Helper** - Suggest functions based on common error messages
- [ ] **Migration Helper** - Suggest modern alternatives for deprecated functions
- [ ] **Best Practices Guide** - Context-aware coding guidelines
- [ ] **Function Complexity Score** - Rate function difficulty for beginners

### AI-Powered Features

- [ ] **Natural Language Query** - "How do I make a player invincible?" → suggests setPedArmor, setElementHealth
- [ ] **Code Pattern Recognition** - Detect anti-patterns and suggest improvements
- [ ] **Argument Validation Generator** - Generate validation code for function parameters
- [ ] **Error Handling Snippets** - Auto-generate try-catch patterns

### Interactive Features

- [ ] **Live Testing Playground** - Generate test code snippets
- [ ] **Diff Viewer** - Compare different function versions
- [ ] **Dependency Checker** - Show which resources/functions are required
- [ ] **Permission Calculator** - Determine required ACL permissions

---

## 💡 Ideas from Other MCP Documentation Servers

### From `@modelcontextprotocol/server-postgres`

- [ ] **SQL Query Builder** (adapt for database functions)
- [ ] **Connection String Helper** (adapt for dbConnect)
- [ ] **Transaction Templates** (adapt for database transactions)

### From `@modelcontextprotocol/server-filesystem`

- [ ] **File Path Autocomplete** (for meta.xml file paths)
- [ ] **Resource Structure Validator** (check meta.xml validity)
- [ ] **Asset Path Resolver** (validate file references)

### From `@modelcontextprotocol/server-puppeteer`

- [ ] **Browser Function Testing** (for CEF/browser functions)
- [ ] **HTML Validation** (for GUI browser elements)
- [ ] **JavaScript Bridge Examples** (for executeBrowserJavascript)

### From Documentation Servers in the Wild

- [ ] **Changelog Tracker** - Track function changes across MTA:SA versions
- [ ] **Popularity Metrics** - Show most commonly used functions
- [ ] **Community Examples** - User-submitted code examples
- [ ] **Interactive API Explorer** - Browse API hierarchically
- [ ] **Quick Reference Cards** - Cheat sheets for common tasks
- [ ] **Offline Mode** - Full functionality without internet

---

## 🔧 Technical Improvements

### Performance

- [ ] **Incremental Cache Updates** - Update only changed functions
- [ ] **Parallel Wiki Fetching** - Fetch multiple pages simultaneously
- [ ] **Response Streaming** - Stream large documentation responses
- [ ] **Query Result Caching** - Cache search results
- [ ] **Database Optimization** - Add indexes for common queries

### Developer Experience

- [ ] **TypeScript Type Definitions** - Generate .d.ts files for MTA:SA functions
- [ ] **VSCode Extension** - Autocomplete and docs in editor
- [ ] **Syntax Highlighting** - Better Lua code formatting
- [ ] **Documentation Linting** - Validate wiki scraping accuracy
- [ ] **Auto-Update Mechanism** - Update function list automatically

### Extensibility

- [ ] **Plugin System** - Allow custom function sources
- [ ] **Custom Scrapers** - Support other wikis/documentation sources
- [ ] **Export Formats** - Export to JSON, Markdown, HTML
- [ ] **API Endpoints** - RESTful API for documentation access
- [ ] **Webhook Integration** - Notify on function updates

---

## 🎨 User Experience Features

### Discoverability

- [ ] **Onboarding Tutorial** - Interactive guide for new users
- [ ] **Function of the Day** - Highlight useful but lesser-known functions
- [ ] **Category Icons** - Visual categorization
- [ ] **Difficulty Badges** - Beginner/Intermediate/Advanced labels
- [ ] **Use Case Tags** - Tag functions by common use cases

### Learning Resources

- [ ] **Video Tutorial Links** - Link to YouTube tutorials
- [ ] **Interactive Workshops** - Step-by-step coding lessons
- [ ] **Challenges/Exercises** - Practice problems for each function
- [ ] **Quiz Mode** - Test knowledge of functions
- [ ] **Progress Tracking** - Track which functions you've learned

### Community Features

- [ ] **Rate Examples** - Vote on helpful code examples
- [ ] **Comment System** - Add notes to functions
- [ ] **Share Configurations** - Export/import custom function collections
- [ ] **Collaboration Tools** - Share with team members
- [ ] **Translation Support** - Multi-language documentation

---

## 🌟 Unique MTA:SA-Specific Features

### Game-Specific Tools

- [ ] **Element Inspector** - Browse element hierarchy
- [ ] **ACL Helper** - Generate ACL configurations
- [ ] **Resource Template Generator** - Create boilerplate resources
- [ ] **Event Flow Visualizer** - Show event propagation
- [ ] **Network Optimization Guide** - Client-server communication tips
- [ ] **Performance Profiler** - Suggest optimization for heavy operations

### Integration Ideas

- [ ] **MTA:SA Server Integration** - Query live server for function usage
- [ ] **Debug Output Parser** - Parse server logs for errors
- [ ] **Resource Analyzer** - Analyze existing resources for improvements
- [ ] **Dependency Graph** - Show inter-resource dependencies
- [ ] **Version Compatibility Checker** - Check if code works on older MTA versions

### Advanced Features

- [ ] **Lua 5.1 Standard Library** - Include standard Lua functions
- [ ] **DGS Library Integration** - Support DGS GUI functions
- [ ] **Custom Function Libraries** - Index popular community libraries
- [ ] **Shader/Model Documentation** - Extend beyond Lua functions
- [ ] **Sound/Video Function Guides** - Multimedia-specific helpers

---

## 📊 Metrics & Analytics (Optional)

- [ ] **Usage Statistics** - Track which functions are queried most
- [ ] **Performance Metrics** - Monitor response times
- [ ] **Cache Hit Rate** - Optimize caching strategy
- [ ] **Error Tracking** - Log and fix common issues
- [ ] **User Feedback** - Collect improvement suggestions

---

## 🛠️ Implementation Priority

### Phase 1 (Next Release - v2.1)

1. Function signature autocomplete
2. Event handler templates
3. TypeScript type definitions
4. Better error messages

### Phase 2 (v2.2)

1. Natural language query
2. Code snippet generation
3. Migration helper for deprecated functions
4. Wiki page versioning

### Phase 3 (v3.0)

1. Plugin system
2. VSCode extension
3. Community examples integration
4. Advanced semantic search with AI

---

## 💭 Inspiration Sources

- **MCP Official Servers**: postgres, filesystem, fetch, puppeteer
- **API Documentation Tools**: DevDocs, Dash, Zeal
- **Learning Platforms**: MDN Web Docs, StackOverflow
- **Game Development**: Unity/Unreal Engine documentation systems
- **Community**: MTA:SA Forum, Discord suggestions

---

## 🤝 Contributing Ideas

Have a cool feature idea? Consider:

1. **Implementation Difficulty**: Easy / Medium / Hard
2. **User Impact**: How many users benefit?
3. **Maintenance**: How much ongoing work?
4. **Dependencies**: What tech does it need?

Add your ideas as GitHub issues or discussions!

---

**Last Updated**: January 14, 2026
**Maintainer**: @lumi
**MTA:SA Version**: 1.6+
