import { FormControl } from 'react-bootstrap';
import mapPropsStream from 'recompose/mapPropsStream';
import createEventHandler from 'recompose/createEventHandler';

const descriptionResizeStyle = { resize: 'vertical' };
const withDescription = mapPropsStream(props => {
  const { handler: onChange, stream: changes } = createEventHandler();
  return props.switchMap(({ $falcor, description, ...props }) => {
    props.defaultValue = description;
    props.placeholder = props.placeholder || '';
    props.style = { ...descriptionResizeStyle, ...props.style };
    return changes
      .map(({ target }) => target.value)
      .debounceTime(200)
      .switchMap(
        description => $falcor.set({ json: { description } }).progressively(),
        (description, { json }) => ({
          ...props,
          onChange,
          defaultValue: json.description
        })
      )
      .startWith({ ...props, onChange });
  });
});

const DescriptionFormControl = withDescription(props => (
  <FormControl componentClass="textarea" {...props} />
));

export { withDescription, DescriptionFormControl };
