/**
 * Todo Hook
 * Logs FlowDeck planning progress whenever OpenCode's todo list is updated.
 * Ported from ECC's todo.updated handler.
 */

type Todo = { text: string; done: boolean; status?: string }

export function createTodoHook(client: { app: { log: (args: { body: { service: string; level: "info" | "warn" | "error" | "debug"; message: string } }) => Promise<any> } }) {


  return async (event: { todos?: unknown }) => {
    // Handle case where todos is not an array (e.g., empty string from schema mismatch)
    const rawTodos = event.todos
    const todos: Todo[] = Array.isArray(rawTodos) ? rawTodos : []
    const completed = todos.filter((t) => t.done || t.status === "completed").length
    const total = todos.length
    if (total === 0) return
    await client.app.log({
      body: {
        service: "flowdeck",
        level: "info",
        message: `[FlowDeck] Progress: ${completed}/${total} tasks`,
      },
    })
  }
}
