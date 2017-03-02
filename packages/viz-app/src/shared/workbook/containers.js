import View from '../view';
import { container } from '@graphistry/falcor-react-redux';

export const withWorkbookContainer = container({
    renderLoading: true,
    fragment: ({ views = [] } = {}) => {
        return `{
            id, title, views: {
                length, current: ${
                    View.fragment(views.current)
                }
            }
        }`;
    }
});
