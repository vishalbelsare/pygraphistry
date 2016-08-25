import React from 'react'
// import styles from './styles.less';
import classNames from 'classnames';
import { container } from 'reaxtor-redux';
import { ExclusionsFragment, ExclusionFragment } from './fragments';
import { Button, Panel, MenuItem, ListGroup, ListGroupItem } from 'react-bootstrap';

export const Exclusions = container(
     ExclusionsFragment, (exclusions) => ({
     exclusions, name: exclusions.name, open: exclusions.open })
)(({ exclusions = [], name, open }) => {
    return  (
        <h3>Exclusions</h3>
        // <ListGroup fill>
        // {exclusions.map((exclusion) => (
        //     <ListGroupItem key={exclusion.key}>
        //         <Exclusion data={exclusion}/>
        //     </ListGroupItem>
        // ))}
        // </ListGroup>
    );
});

export const Exclusion = container(
    ExclusionFragment
)(() => {
    return (
        <p>Exclusion</p>
    );
});
