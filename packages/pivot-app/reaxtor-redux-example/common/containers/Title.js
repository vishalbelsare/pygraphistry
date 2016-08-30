import React from 'react'
import { container } from 'reaxtor-redux';

function Title({
        name = '', year = '',
        rating = '', boxshot = '',
        userRating = '', description = ''
    }) {
    return (
        <div
            title={name}
            className='title'
            style={{
                backgroundImage: `url(${boxshot})`
            }}>
        </div>
    );
}

function renderLoading({
        name = '', year = '',
        rating = '', boxshot = '',
        userRating = '', description = ''
    }) {
    return (
        <div title={name}
             className='title'>
            <span>Loading movie{name && ` ${name}` || ''}...</span>
        </div>
    );
}

function mapStateToFragment(title) {
    return `{
        name, year, rating, boxshot,
        description, userRating
    }`;
}

export default container(
    mapStateToFragment
)(Title);
