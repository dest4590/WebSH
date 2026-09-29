import { ref } from "vue"
import type { ServerRecord } from "~/lib/db"

export interface DraggedFileInfo {
    server: ServerRecord
    path: string
    name: string
    isDir: boolean
}

const draggingFile = ref<DraggedFileInfo | null>(null)

export function useFileDrag() {
    return { draggingFile }
}
