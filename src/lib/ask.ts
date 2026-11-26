/**
 * The one question box (session 31 QA: the browser's grey confirm() was the one thing in the product that was not marble):
 * a white card over everything — the question, then Cancel and the answer. Esc or Cancel = no; Enter or the answer = yes.
 * Focus starts on Cancel, so a stray Space never says yes. A native <dialog> (showModal): the page under it takes no clicks
 * and Tab stays inside. `yes` names what saying yes does ("Delete", "Replace"); `danger` draws it in terracotta.
 */
export function ask(question: string, yes = 'OK', danger = false): Promise<boolean> {
  return card(question, [yes], danger).then((v) => v !== null)
}

/**
 * The same card with two or more answers (session 31 levels: "Add these floors to <project> / Make a new project"): Cancel,
 * then each answer, the last one the main one (Enter). The answer's index, or null for Cancel / Esc.
 */
export const askChoice = (question: string, answers: string[]): Promise<number | null> => card(question, answers, false).then((v) => (v === null ? null : Number(v)))

/**
 * The same card with a line to type (a new name, a key; the browser's grey prompt() is gone too): it opens with `value`,
 * all of it selected, the cursor in it. Enter or `yes` gives what was typed; Esc or Cancel gives null.
 */
export const askText = (question: string, input: { value?: string; placeholder?: string } = {}, yes = 'OK'): Promise<string | null> => card(question, [yes], false, input)

/** the card: Cancel and the answers; what was typed (a field), else the chosen answer's index as text; null for Cancel */
function card(question: string, answers: string[], danger: boolean, input?: { value?: string; placeholder?: string }): Promise<string | null> {
  return new Promise((done) => {
    const d = document.createElement('dialog')
    d.className = 'ask'
    const q = d.appendChild(document.createElement('p'))
    q.id = 'ask-question'
    q.textContent = question
    d.setAttribute('aria-describedby', q.id)
    const field = input ? d.appendChild(document.createElement('input')) : null
    if (field) {
      Object.assign(field, { type: 'text', value: input!.value ?? '', placeholder: input!.placeholder ?? '', spellcheck: false, autocomplete: 'off' })
      field.setAttribute('aria-labelledby', q.id)
    }
    const row = d.appendChild(document.createElement('div'))
    row.className = 'ask-row'
    const end = (i: number | null) => {
      d.close()
      d.remove()
      done(i === null ? null : (field?.value ?? String(i)))
    }
    const button = (text: string, cls: string, i: number | null) => {
      const b = row.appendChild(document.createElement('button'))
      Object.assign(b, { type: 'button', className: cls, textContent: text, onclick: () => end(i) })
      return b
    }
    const no = button('Cancel', '', null)
    // (the last answer is the main one; the others plain, as Cancel is)
    answers.forEach((a, i) => button(a, i < answers.length - 1 ? '' : danger ? 'danger' : 'primary', i))
    d.addEventListener('cancel', (e) => {
      e.preventDefault()
      end(null) // Esc
    })
    // Enter says yes on its release, and only one pressed here: the Enter that asked (a typed scale) must not answer too.
    // No key gets past the box to the page's own keys (walking, R, Delete…), typing in its field included.
    let armed = false
    const key = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key !== 'Enter') return
      e.preventDefault()
      if (e.type === 'keydown') armed = true
      else if (e.type === 'keyup' && armed) end(answers.length - 1)
    }
    for (const t of ['keydown', 'keypress', 'keyup']) d.addEventListener(t, key as EventListener)
    document.body.append(d)
    d.showModal()
    if (field) field.focus(), field.select()
    else no.focus()
  })
}
