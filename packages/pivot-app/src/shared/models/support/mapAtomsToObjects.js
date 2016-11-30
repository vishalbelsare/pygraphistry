export function mapAtomsToObjects(atom) {
    if (typeof atom === 'object' && atom.$type === 'atom') {
        return atom.value;
    } else {
        return atom;
    }
}
