# Plotline V1 — UI / Architecture Pass

This pass intentionally focuses on the V1 product boundary: project dashboard, project creation, plan workspace and lightweight 3D walkthrough UI. The existing prototype capabilities for image upload, room tracing, doors/windows, scale calibration, local saving, sharing codes and 3D generation remain available.

## Structure
- `js/app.js` — application coordinator / composition root
- `js/state/AppState.js` — application state
- `js/core/Geometry.js` — geometry utilities
- `js/core/Units.js` — measurement formatting/parsing
- `js/core/Modal.js` — reusable modal input
- `js/project/ProjectStore.js` — storage boundary for future Supabase replacement
- `js/project/ProjectSerializer.js` — persistence model boundary
- `js/editor/PlanEditor.js` — 2D plan interaction and drawing
- `js/renderer/ThreeRenderer.js` — 3D scene and walkthrough
- `js/ui/UIController.js` — dashboard/create/workspace UI
- `styles/` — tokens, layout, components and viewport styling

## Backend boundary
No Supabase or other backend is added in V1. `ProjectStore` is the seam for that future change. Local browser storage remains the prototype persistence layer.

## Deliberately outside this UI pass
VR, payments, scheduling, complex BIM, CAD replacement, photorealistic rendering, cost estimation and AI-generated houses are not part of the V1 interface.
