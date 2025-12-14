# Reece-AI-Chatbot

🤖 **An intelligent, NEPQ-trained AI sales assistant that qualifies leads and books appointments around the clock.**

## What It Does

Reece is a conversational AI chatbot designed for home improvement companies (specifically impact windows & doors) that:

- **Qualifies leads** using NEPQ (Neuro-Emotional Persuasion Questions) sales methodology
- **Books appointments** directly into your calendar
- **Manages conversations** across SMS and live chat
- **Speaks multiple languages** (English, Spanish, Portuguese, French, Creole)
- **Remembers context** across sessions with intelligent memory management
- **Integrates seamlessly** with GoHighLevel CRM

## Key Features

| Feature | Description |
|---------|-------------|
| 🧠 **NEPQ Sales Flow** | 9-stage conversation framework that helps prospects sell themselves |
| 📅 **Smart Scheduling** | Real-time calendar availability with automatic appointment booking |
| 🌐 **Multi-Language** | Auto-detects and responds in the customer's preferred language |
| 💾 **Session Memory** | Persists conversation context, trust scores, and customer insights |
| 🔐 **OAuth Service** | Dedicated token management for secure GHL API access |
| ⚡ **n8n Powered** | Flexible workflow automation with 50+ integrated nodes |

## Architecture

- **OAuth Service**: Node.js/Express service for GHL token management (Railway)
- **Workflow Engine**: n8n for conversation orchestration and API integrations
- **AI Backend**: GPT-4o with custom NEPQ prompting and intent analysis
- **Vector Store**: Supabase for RAG-based knowledge retrieval
- **CRM**: GoHighLevel for contact management, messaging, and scheduling

## Tech Stack

`Node.js` `Express` `n8n` `OpenAI GPT-4o` `GoHighLevel API` `Supabase` `Railway`

---

Built for 24/7 automated lead engagement and appointment setting.
