export const SWITCH_SCREEN = 'switch-screen';

export function switchScreen(screen) {
    return {
        type: SWITCH_SCREEN,
        screen: screen
    };
}
