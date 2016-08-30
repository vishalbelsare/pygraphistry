import React from 'react'
import TitleList from './TitleList';
import { container } from 'reaxtor-redux';

function Genre({ name = '', titles = [] } = {}) {

    if (!titles || titles.length === 0) {
        return (
            <div className='genre-list'>
                <h4>{name}</h4>
                <span>No Movies in this genre</span>
            </div>
        );
    }

    return (
        <div className='genre-list'>
            <h4>{name}</h4>
            <TitleList data={titles}/>
        </div>
    );
}

function renderLoading(props) {
    return (
        <div className='genre-list'>
            Loading Movies...
        </div>
    );
}

function mapStateToFragment({ titles = [] } = {}) {
    return `{
        name,
        titles: ${
            TitleList.fragment(titles)
        }
    }`;
}

export default container(
    mapStateToFragment
)(Genre);
