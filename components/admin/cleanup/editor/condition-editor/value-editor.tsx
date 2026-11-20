import { anyFieldMeta } from "@/lib/cleanup/fields/catalog"

import { ChoiceValue } from "./choice-value"
import { CountInput } from "./count-input"
import { DATE_FIELDS, operatorOf, type ValueEditorProps } from "./editor-parts"
import { RelativeDateInput } from "./relative-date-input"
import { RequesterPicker } from "./requester-picker"
import { SizeInput } from "./size-input"

/**
 * The value editor of the condition's field (UX 6): a date, a size, a count,
 * the member list or a choice. The body leaves it out for an operator with
 * no value (Last played never).
 */
export function ValueEditor(props: ValueEditorProps) {
  const { condition } = props
  const control = anyFieldMeta(condition.field).valueControl(operatorOf(condition))
  if (control === "radio") return <ChoiceValue {...props} />
  if (control === "combobox") return <RequesterPicker {...props} />
  if (condition.field === "file.size") return <SizeInput {...props} />
  if (DATE_FIELDS.includes(condition.field)) return <RelativeDateInput {...props} />
  return <CountInput {...props} />
}
