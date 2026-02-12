# Architecture Overview

## Service boundaries

- **API (`apps/api`)**: synchronous request/response operations, auth, orchestration.
- **Worker (`apps/worker`)**: asynchronous queue consumers for ingestion, matching, and apply tasks.
- **Common (`libs/common`)**: shared schema and contract library consumed by API + worker.
- **Infra (`infra`)**: local and deployment infrastructure assets.

## Data flow

1. API receives an event/request.
2. API validates payload via `@ezjob/common` schemas.
3. API enqueues work for downstream queues.
4. Worker consumes queue messages and performs background processing.
