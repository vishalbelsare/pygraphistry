import moment from 'moment';
import { SingleDatePicker } from 'react-dates';
import {
    HORIZONTAL_ORIENTATION,
} from 'react-dates/constants';


export default class DateTimePicker extends React.Component {

    constructor(props, context) {
        super(props, context);

        this.state = {
            focused: false,
            date: null, // momentPropTypes.momentObj or null
            time: null
        };
    }

    render () {
        
        const { baseid, placeholder } = this.props;

        return (<SingleDatePicker
                id={`sdp_${baseid}`}                
                date={this.state.date}
                onDateChange={date => this.setState({ date })}
                focused={ this.state.focused }
                onFocusChange={ ({ focused }) => this.setState({ focused }) }
                
                isOutsideRange={ () => false }
                showClearDates={ true }
                orientation={HORIZONTAL_ORIENTATION}
                showDefaultInputIcon={true}
                withPortal={true}

                placeholder={ placeholder }
            />);
    }

};


