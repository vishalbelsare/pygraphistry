import Workbook from '../../workbook';
import { container } from '@graphistry/falcor-react-redux';

export const withAppContainer = container({
    renderLoading: true,
    fragment: ({ workbooks = [] } = {}) => {
        return `{
            workbooks: {
                length, open: ${
                    Workbook.fragment(workbooks.open)
                }
            }
        }`;
    }
});
