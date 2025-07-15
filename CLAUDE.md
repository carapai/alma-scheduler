# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Development server**: `bun dev` - Starts development server with hot reload
- **Production build**: `bun run build` - Builds production-ready assets to `dist/`
- **Production server**: `bun start` - Runs production server
- **Install dependencies**: `bun install`

## Architecture Overview

This is a comprehensive schedule management application built with Bun runtime that combines React frontend with BullMQ job queue system for processing DHIS2 to ALMA data synchronization tasks.

### Core Components

**Frontend (React + Ant Design)**
- `src/App.tsx` - Main React application with schedule management interface
- Features schedule creation, editing, starting/stopping, and real-time tracking
- Uses Ant Design components for UI with TailwindCSS styling
- Real-time schedule status updates via React Query (5-second intervals)

**Backend Systems**
- `src/scheduler.ts` - Main scheduler class integrating SurrealDB with BullMQ
- `src/schedule-service.ts` - SurrealDB service for schedule persistence
- `src/unified-queue.ts` - BullMQ-based job queue system with Redis backend
- `src/utils.ts` - DHIS2 API integration and ALMA data upload utilities

**Schedule Processing Flow**
1. Schedules are created via React UI and stored in SurrealDB embedded database
2. Schedules can run immediately, be scheduled for future execution, or run recurring
3. BullMQ handles job execution with progress tracking and retry logic
4. Node-cron manages recurring schedule execution
5. Real-time status updates are displayed in the frontend

### Key Data Models

**Schedule** (`src/interfaces.ts:10-36`)
- Complete schedule definition with type, cron expression, and execution config
- Supports immediate, one-time, and recurring execution types
- Includes retry configuration, progress tracking, and status management

### Schedule Types

**Immediate Schedules**
- Execute immediately when created or started
- Ideal for one-off data synchronization tasks

**One-time Schedules**
- Execute once at a specified time or when manually started
- Can be configured to run immediately upon creation

**Recurring Schedules**
- Execute repeatedly based on cron expressions
- Managed by node-cron with automatic job queuing
- Can be paused and resumed as needed

### External Dependencies

- **Redis**: Required for BullMQ queue operations
- **DHIS2 instances**: Configured in `configuration.json` with authentication
- **ALMA instances**: Target systems for data uploads, also in `configuration.json`

### Configuration

The application expects a `configuration.json` file with:
```json
{
  "dhis2-instances": {
    "instance-url": {"username": "...", "password": "..."}
  },
  "alma-instances": {
    "instance-url": {"username": "...", "password": "...", "backend": "..."}
  }
}
```

### Build System

Uses custom Bun build script (`build.ts`) that:
- Processes all HTML files in `src/`
- Includes TailwindCSS plugin
- Supports extensive CLI configuration options
- Outputs to `dist/` directory

### Database

SurrealDB embedded database (`surrealkv://scheduler`) with `schedules` table containing:
- Schedule definitions with full schema validation
- Status tracking and progress monitoring
- Execution history and retry configuration
- Real-time updates for frontend synchronization

### API Endpoints

- `GET /api/schedules` - List all schedules
- `POST /api/schedules` - Create new schedule
- `GET /api/schedules/:id` - Get schedule status with job details
- `PUT /api/schedules/:id` - Update schedule
- `DELETE /api/schedules/:id` - Delete schedule
- `POST /api/schedules/:id/start` - Start schedule execution
- `POST /api/schedules/:id/stop` - Stop schedule execution
- `GET /api/processors` - List available processors
- `GET /api/instances` - List configured DHIS2/ALMA instances