import {
    Observable,
    Subscriber,
    Subscription,
    Subject,
    AsyncSubject,
    BehaviorSubject,
    ReplaySubject
} from 'rxjs';

import setObservableConfig from 'recompose/setObservableConfig';
import rxjsObservableConfig from 'recompose/rxjsObservableConfig';

Observable.return = value => Observable.of(value);

Subject.prototype.onNext = Subject.prototype.next;
Subject.prototype.onError = Subject.prototype.error;
Subject.prototype.onCompleted = Subject.prototype.complete;
Subject.prototype.dispose = Subscriber.prototype.unsubscribe;
AsyncSubject.prototype.onNext = AsyncSubject.prototype.next;
AsyncSubject.prototype.onCompleted = AsyncSubject.prototype.complete;
BehaviorSubject.prototype.onNext = BehaviorSubject.prototype.next;
ReplaySubject.prototype.onNext = ReplaySubject.prototype.next;

Subscriber.prototype.onNext = Subscriber.prototype.next;
Subscriber.prototype.onError = Subscriber.prototype.error;
Subscriber.prototype.onCompleted = Subscriber.prototype.complete;
Subscriber.prototype.dispose = Subscriber.prototype.unsubscribe;

Subscription.prototype.dispose = Subscription.prototype.unsubscribe;

setObservableConfig(rxjsObservableConfig);
