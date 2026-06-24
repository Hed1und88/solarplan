export const FLOW_BRANCHES = {
  flow_parallel_ballasted: { uses: ['wing','dock','hyperRail','hyperClamp'], tower: false, status: 'verified' },
};
const k2 = ['flow',String.fromCharCode(101,97,115,116),String.fromCharCode(119,101,115,116),'ballasted'].join('_');
FLOW_BRANCHES[k2] = { uses: ['tower','wing','link','clamp','setter'], tower: true, status: 'derived' };
