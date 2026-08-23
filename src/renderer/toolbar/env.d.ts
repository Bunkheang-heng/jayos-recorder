import type { ToolbarApi } from '../../preload/toolbar'

declare global {
  interface Window {
    api: ToolbarApi
  }
}
