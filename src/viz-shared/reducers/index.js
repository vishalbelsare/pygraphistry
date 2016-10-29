export * from './toolbar';
export * from './settings';
export * from './expressions';
export * from './encodings';

export default function rootReducer(state, action) {
    if (action.type === 'falcor-react-redux/update') {
        return action.data;
    }
    return state;
}
