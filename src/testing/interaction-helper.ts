import { By } from '@angular/platform-browser';
import { DebugElement } from '@angular/core';
import { MatError } from '@angular/material';

export function mockEvent(type: string, eventInterface = 'Event', canBubble = false, cancellable = true) {
    const event = document.createEvent(eventInterface);
    event.initEvent(type, canBubble, cancellable);
    return event;
}

export function clickElement(element: DebugElement, cssSelector: string): HTMLButtonElement {
    const editButton = element.query(By.css(cssSelector));
    const button = editButton.nativeElement as HTMLButtonElement;
    button.click();
    return button;
}

export function mockInput(element: DebugElement, cssSelector: string, value: string): HTMLInputElement {
    const inputElement = element.query(By.css(cssSelector));
    const input = (inputElement.nativeElement as HTMLInputElement);
    input.value = value;
    input.dispatchEvent(mockEvent('focusin'));
    input.dispatchEvent(mockEvent('input'));
    return input;
}

export function errorMessage(element: DebugElement): string {
    const matErrorElement = element.query(By.directive(MatError));
    const spanElement = matErrorElement.query(By.css('span'));

    let innerText: string;

    if (spanElement) {
        const span = spanElement.nativeElement as HTMLSpanElement;
        innerText = span.innerText.trim();
    } else {
        innerText = matErrorElement.nativeElement.innerText.trim();
    }
    return innerText;
}
