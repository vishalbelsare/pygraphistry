export * from './scene';
export * from './labels';
export * from './toolbar';
export * from './settings';
export * from './encodings';
export * from './inspector';
export * from './histograms';
export * from './expressions';

export default function rootReducer(state, action) {
    if (action.type === 'falcor-react-redux/update') {
        return action.data;
    }
    return state;
}
