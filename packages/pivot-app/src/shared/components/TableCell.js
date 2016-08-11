import { Component } from 'reaxtor';
import { tcell as tableCellClassName } from './styles.css';

export class TableCell extends Component {
    loadProps(model) {
        return model.get(`['${this.field}']`);
    }
    loadState(model, props) {

        const field = this.field;
        const blurs = this.listen('blur');
        const focused = this.listen('focus');
        const inputs = this.listen('input').filter(({ target }) => !!target.value);
        const entered = this.listen('keydown').filter(({ keyIdentifier }) => (
            keyIdentifier === 'Enter'
        ));

        const [sameBlur, changeBlur] = blurs.partition(({ target }) => (
            target.value === `${props[field]}`) || (
            target.value === '' &&
            target.placeholder === `${props[field]}`
        ));

        const resetOnBlur = sameBlur.map(({ target }) => ({
            placeholder: props[field],
            target, [field]: props[field],
        }))
        .do((val) => console.log('reset on blur', (val)));

        const clearOnFocus = focused.map(({ target }) => ({
            target, [field]: '',
            placeholder: props[field],
        }))
        .do((val) => console.log("clear on Focus", val));


        const writeOnChange = entered
            .merge(changeBlur)
            .do(val => console.log('Write on Change', val))
            .map(({ target }) => ({
                target, value: target.value || target.placeholder
            }))
            .do(val => console.log('Write on change 2', val))
            .do(val => document.activeElement.blur())
            .switchMap(
                ({ target, value }) => model
                    .call('setValue', [value])
                    .mergeMapTo(this.loadProps(model)),
                ({ target, value }, { json }) => ({
                    target, placeholder: json[field], ...json
                })
            );

        return clearOnFocus
            .merge(writeOnChange, resetOnBlur)
            .map(({ target, placeholder, [field]: value }) => ({
                [field]: target.value = value,
                placeholder: target.placeholder = placeholder
            }));
    }
    render(model, state) {
        const { type, field, isHeader } = this;
        const { [field]: value, placeholder = value } = state;
        if (isHeader) {
            return (<span> 
                    {value}
            </span>)
        } else {
            return (
                <div class_={{ [tableCellClassName]: true }}>
                    <input
                        type={type} value={value}
                        readonly={false}
                        disabled={false}
                        placeholder={placeholder}
                        on-blur={this.dispatch('blur')}
                        on-focus={this.dispatch('focus')}
                        on-input={this.dispatch('input')}
                        on-keydown={this.dispatch('keydown')}/>
                </div>
            );
        }
    }
}
