//[ {key, ...}, ... ]_n -> [ {key, ...}, ... ]_(k < n)
// Combine array elements with equal 'key' field (as str); drop if missing/0-length
export function mergeByKey(a, key) {

	//{key -> [{key, ...}]}
	const groups = 
		a.reduce((groups, o) => {
				const id = o[key];
				if (!(key in o) || id===undefined || !((id + '').length)) {
					return groups;
				}				
				const group = groups[id] = groups[id] || [];
				group.push(o);
				return groups;
			},
			{});

	return Object.keys(groups)
		.reduce(
			(nodes, groupId) => 
			[
				...nodes, 
				groups[groupId].reduce(
					(node, node2) => ({ ...node, ...node2 }),
					{})
			], []);
}