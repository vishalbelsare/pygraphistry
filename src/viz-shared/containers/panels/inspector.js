import React from 'react'
// import styles from './styles.less';
import classNames from 'classnames';
import { connect } from 'reaxtor-redux';
import { InspectorFragment } from './fragments';
import { Button, Panel, MenuItem, ListGroup, ListGroupItem } from 'react-bootstrap';

export const Inspector = connect(
     InspectorFragment, (inspector) => ({
     Inspector, name: inspector.name, open: inspector.open })
)(({ Inspector = [], name, open }) => {
    return  (
        <h3>Inspector</h3>
    );
});
