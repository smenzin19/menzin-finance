import { useState, useEffect } from 'react'
import { X, Trash2, GripVertical } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { insertOwned } from '../lib/db'

export default function RulesEditor({ cats, onClose }) {
  const [rules, setRules] = useState([])
  const [newKeywords, setNewKeywords] = useState('')
  const [newCategory, setNewCategory] = useState(cats[0]?.name || '')
  // local edits buffer: { [id]: { keywords, category } }
  const [edits, setEdits] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('categorization_rules').select('*').order('sort_order')
    setRules(data || [])
    setEdits({})
  }

  function startEdit(rule, field, value) {
    setEdits(prev => ({ ...prev, [rule.id]: { keywords: rule.keywords, category: rule.category, ...prev[rule.id], [field]: value } }))
  }

  async function commitEdit(rule) {
    const edit = edits[rule.id]
    if (!edit) return
    await supabase.from('categorization_rules').update({ keywords: edit.keywords, category: edit.category }).eq('id', rule.id)
    load()
  }

  async function deleteRule(id) {
    await supabase.from('categorization_rules').delete().eq('id', id)
    load()
  }

  async function addRule() {
    if (!newKeywords.trim() || !newCategory) return
    await insertOwned('categorization_rules', {
      keywords: newKeywords.trim(),
      category: newCategory,
      sort_order: rules.length,
    })
    setNewKeywords('')
    load()
  }

  function fieldValue(rule, field) {
    return edits[rule.id]?.[field] ?? rule[field]
  }

  const inputStyle = {
    border: '1px solid var(--line)',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 13,
    background: '#fff',
    width: '100%',
  }

  const selectStyle = { ...inputStyle, width: 'auto', minWidth: 120 }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(28,27,24,.5)', zIndex: 60, display: 'grid', placeItems: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        className="card card-pad"
        style={{ width: 'min(640px,96vw)', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>Categorization rules</h2>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              Matched top-to-bottom · first match wins · keywords are comma-separated and case-insensitive
            </p>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        {rules.length === 0 && (
          <p className="muted" style={{ textAlign: 'center' }}>No rules yet — add one below.</p>
        )}

        {rules.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 24 }}></th>
                  <th>Keywords</th>
                  <th>Category</th>
                  <th style={{ width: 32 }}></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r, idx) => (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'right', paddingRight: 4 }}>
                      {idx + 1}
                    </td>
                    <td>
                      <input
                        style={inputStyle}
                        value={fieldValue(r, 'keywords')}
                        onChange={e => startEdit(r, 'keywords', e.target.value)}
                        onBlur={() => commitEdit(r)}
                        onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                        placeholder="e.g. uber, lyft"
                      />
                    </td>
                    <td>
                      <select
                        style={selectStyle}
                        value={fieldValue(r, 'category')}
                        onChange={e => { startEdit(r, 'category', e.target.value); commitEdit({ ...r, ...edits[r.id], category: e.target.value }) }}
                      >
                        {cats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        {/* keep the saved value even if category was deleted */}
                        {!cats.some(c => c.name === fieldValue(r, 'category')) && (
                          <option value={r.category}>{r.category}</option>
                        )}
                      </select>
                    </td>
                    <td>
                      <button className="icon-btn" onClick={() => deleteRule(r.id)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <div className="section-title" style={{ marginBottom: 10, fontSize: 13 }}>Add rule</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              style={{ ...inputStyle, flex: 2, minWidth: 160 }}
              value={newKeywords}
              onChange={e => setNewKeywords(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addRule()}
              placeholder="Keywords, comma-separated"
            />
            <span className="muted" style={{ fontSize: 13 }}>→</span>
            <select
              style={selectStyle}
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
            >
              {cats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <button className="btn" onClick={addRule}>Add</button>
          </div>
        </div>
      </div>
    </div>
  )
}
