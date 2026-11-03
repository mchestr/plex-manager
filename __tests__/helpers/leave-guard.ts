/** Whether the browser would ask before the tab closes or reloads: a `beforeunload` listener prevented the event. */
export function leaveIsGuarded(): boolean {
  const event = new Event("beforeunload", { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}
