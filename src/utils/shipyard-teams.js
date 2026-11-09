export const teamCategories = [
  { value: '', label: '未分类' },
  { value: 'grinding', label: '打磨班组' },
  { value: 'painting', label: '油漆班组' },
]
export const teamFilters = [{ value: 'all', label: '全部班组' }, ...teamCategories]
export const teamLabel = value => teamCategories.find(c => c.value === (value || ''))?.label || '未分类'
export const matchesTeam = (person, filter) => filter === 'all' || (person.teamCategory || '') === filter
