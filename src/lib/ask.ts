/**
 * The one question box (session 31 QA: the browser's grey confirm() was the one thing in the product that was not marble):
 * a white card over everything — the question, then Cancel and the answer. Esc or Cancel = no; Enter or the answer = yes.
 * Focus starts on Cancel, so a stray Space never says yes. A native <dialog> (showModal): the page under it takes no clicks
 * and Tab stays inside. `yes` names what saying yes does ("Delete", "Replace"); `danger` draws it in terracotta.
 */
export function ask(question: string, yes = 'OK', danger = false): Promise<boolean> {
  return new Promise((done) => {
    const d = document.createElement('dialog')
    d.className = 'ask'
    const q = d.appendChild(document.createElement('p'))
    q.id = 'ask-question'
    q.textContent = question
    d.setAttribute('aria-describedby', q.id)
    const row = d.appendChild(document.createElement('div'))
    row.className = 'ask-row'
    const end = (v: boolean) => {
      d.close()
      d.remove()
      done(v)
    }
    const button = (text: string, cls: string, v: boolean) => {
      const b = row.appendChild(document.createElement('button'))
      Object.assign(b, { type: 'button', className: cls, textContent: text, onclick: () => end(v) })
      return b
    }
    const no = button('Cancel', '', false)
    button(yes, danger ? 'danger' : 'primary', true)
    d.addEventListener('cancel', (e) => {
      e.preventDefault()
      end(false) // Esc
    })
    // Enter says yes on its release, and only one pressed here: the Enter that asked (a typed scale) must not answer too.
    // No key gets past the box to the page's own keys (walking, R, Delete…).
    let armed = false
    const key = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key !== 'Enter') return
      e.preventDefault()
      if (e.type === 'keydown') armed = true
      else if (e.type === 'keyup' && armed) end(true)
    }
    for (const t of ['keydown', 'keypress', 'keyup']) d.addEventListener(t, key as EventListener)
    document.body.append(d)
    d.showModal()
    no.focus()
  })
}
