import React from 'react'
import { container } from '@graphistry/falcor-react-redux';
import {
    FilterItem,
    FiltersList,
    FilterTemplates
} from 'viz-shared/components/filters';

import {
    addFilter,
    removeFilter,
    setFilterEnabled,
    updateFilterExpression
} from 'viz-shared/actions/filters';

export const Filters = container(
    ({ length = 0, templates = [] }) => `{
        id, name, length, [0...${length}]: ${
            Filter.fragment()
        },
        templates: {
            length, [0...${templates.length}]: {
                name, dataType
            }
        }
    }`,
    (filters) => ({ filters, templates: filters.templates }),
    { addFilter, removeFilter }
)(renderFilters);

export const Filter = container(
    () => `{
        id, title, level, query,
        controlType, enabled, attribute
    }`,
    (filter) => filter,
    { setFilterEnabled, updateFilterExpression }
)(FilterItem);

function renderFilters({ filters = [], removeFilter, ...props }) {
    return (
        <FiltersList {...props}>
        {filters.map((filter, index) => (
            <Filter data={filter}
                    key={`${index}: ${filter.id}`}
                    removeFilter={removeFilter}/>
        ))}
        </FiltersList>
    );
}
