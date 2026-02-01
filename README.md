![Cartography Banner](public/banner.png)

# Cartography

**Your Personal Knowledge Base & RAG Management Suite**

Cartography is a powerful desktop application designed to transform your documents—PDFs, web pages, and text files—into a searchable, AI-ready knowledge base. Whether you are an AI engineer building RAG pipelines or a researcher managing vast amounts of information, Cartography creates a unified workspace to process and store your data efficiently.

---

## 🚀 What It Does

In simple terms, Cartography reads your documents and translates them into "vectors" (mathematical representations of meaning) that computers can understand.

- **Centralized Workspace**: Organize your documents into projects.
- **Universal Import**: Bring in PDFs, website URLs, and text files.
- **AI-Powered Processing**: Use your favorite AI models (like OpenAI, Cohere, or local models via Ollama) to understand the text.
- **Database Connectivity**: Save your processed data directly to popular databases like PostgreSQL, Pinecone, or ChromaDB.
- **Search & Explore**: Instantly search through your documents using semantic search (searching by meaning, not just keywords).

---

## 🛠️ How to Operate

### 1. Create a Project

Start by creating a new project in the dashboard. Give it a name and configure your preferred settings:

- **Embedding Model**: Choose which AI brain to use (e.g., OpenAI `text-embedding-3-small` or a local model).
- **Vector Store**: Select where to save the data (e.g., a local ChromaDB instance or a remote PostgreSQL database).

### 2. Import Documents

Navigate to the **Documents** tab and add your content:

- **Drag & Drop**: Simply drag PDF or text files into the window.
- **Add URL**: Paste a website link to import web content.
- **Batch Import**: Add multiple files at once.

### 3. Process & Embed

Once your documents are listed:

- **Chunking**: The app automatically breaks down long documents into manageable "chunks". You can customize the size and overlap of these chunks.
- **Start Processing**: Click the process button. The app will read through your files, generate embeddings using the selected AI model, and save them to your database.
- **Track Progress**: Watch the real-time progress bar as documents are processed.

### 4. Search & Test

After processing is complete, go to the **Search** playground:

- **Ask Questions**: Type a query like "What is the summary of document X?"
- **See Results**: The app will return the most relevant chunks from your documents, showing exactly where the information came from.
- **Verify**: Ensure your model is retrieving the correct information for your needs.

---

## 💻 Getting Started

This is a desktop application built with Electron.

**Prerequisites:**

- An API Key for your chosen provider (e.g., OpenAI API Key) OR a local Ollama setup.
- A destination database (optional; the app can use local defaults).

**Launch:**

1. Download integration and install the application.
2. Open Cartography.
3. Follow the on-screen wizard to set up your first project.

---

_Powered by XorenAI_
