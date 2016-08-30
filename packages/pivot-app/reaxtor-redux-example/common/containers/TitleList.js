import React from 'react'
import Title from './Title';
import { container } from 'reaxtor-redux';

function TitleList({ titles = [] } = {}) {
    return (
        <ul className='titles-list'>
        {titles.map((title, index) => (
            <li key={title.key}
                className='titles-list-item'>
                <Title data={title}/>
            </li>
        ))}
        </ul>
    );
}

function renderLoading(props) {
    return (
        <div className='titles-list'>
            Loading Movies...
        </div>
    );
}

function mapStateToFragment(titles = []) {
    let { length = 0 } = titles;
    // length = 1;
    return `{
        length, [0...${length}]: ${
            Title.fragment()
        }
    }`;
}

function mapFragmentToProps(titles) {
    return { titles };
}

export default container(
    mapStateToFragment,
    mapFragmentToProps
)(TitleList);
