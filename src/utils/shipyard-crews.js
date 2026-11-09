export const crewLabel = crew => `${crew.name}（${crew.leaderName || '待指定组长'}）`;
export const workerCrewLabel = (worker, crews = []) => {
    const crew = crews.find(c => String(c.id) === String(worker.crewId));
    return crew ? crewLabel(crew) : worker.crewLabel || worker.team || '未分配具体班组';
};
export const matchesCrew = (worker, filter) => filter === 'all' || String(worker.crewId || '') === String(filter || '');
export function groupWorkers(workers, crews = []) {
    const groups = crews.map(c => ({ key: String(c.id), label: crewLabel(c), people: [] }));
    const byId = new Map(groups.map(g => [g.key, g]));
    const unassigned = { key: '', label: '未分配具体班组', people: [] };
    for (const worker of workers) (byId.get(String(worker.crewId)) || unassigned).people.push(worker);
    return [...groups, unassigned].filter(g => g.people.length);
}
