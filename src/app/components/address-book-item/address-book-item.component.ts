import {
    Component,
    EventEmitter,
    Input,
    OnChanges,
    Output,
    SimpleChange,
    SimpleChanges
} from '@angular/core';
import { IdenticonCacheService } from '../../services/identicon-cache.service';
import { Contact } from '../../models/contact';
import {
    ConfirmationDialogComponent,
    ConfirmationDialogPayload
} from '../confirmation-dialog/confirmation-dialog.component';
import { flatMap } from 'rxjs/operators';
import { EMPTY, of } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import {
    FormBuilder,
    FormControl,
    FormGroup,
    Validators
} from '@angular/forms';

@Component({
    selector: 'app-address-book-item',
    templateUrl: './address-book-item.component.html',
    styleUrls: ['./address-book-item.component.css']
})
export class AddressBookItemComponent implements OnChanges {
    @Input() contact: Contact;
    @Input() editMode = false;
    @Output() edit: EventEmitter<boolean> = new EventEmitter();
    @Output() cancelled: EventEmitter<boolean> = new EventEmitter();
    @Output() update: EventEmitter<Contact> = new EventEmitter();
    @Output() delete: EventEmitter<Contact> = new EventEmitter();

    readonly form: FormGroup = this.fb.group({
        label: new FormControl(
            {
                value: '',
                disabled: true
            },
            Validators.required
        )
    });

    constructor(
        private identiconCache: IdenticonCacheService,
        public dialog: MatDialog,
        private fb: FormBuilder
    ) {}

    toggleEdit() {
        this.editMode = !this.editMode;
        this.edit.emit(this.editMode);
        const control = this.form.get('label');
        if (this.editMode) {
            control.enable({ onlySelf: true });
        } else {
            control.disable({ onlySelf: true });
        }
    }

    identicon(address: string) {
        return this.identiconCache.getIdenticon(address);
    }

    showConfirmation() {
        const contact = this.contact;
        const payload: ConfirmationDialogPayload = {
            title: 'Delete contact',
            message: `Are you sure you want to delete the entry <strong>${
                contact.label
            }</strong> for address <strong>${contact.address}</strong>?`
        };

        const dialog = this.dialog.open(ConfirmationDialogComponent, {
            data: payload,
            width: '360px'
        });

        const completeIfCancel = flatMap(result => {
            if (!result) {
                return EMPTY;
            } else {
                return of(result);
            }
        });

        dialog
            .afterClosed()
            .pipe(completeIfCancel)
            .subscribe(() => this.delete.emit(this.contact));
    }

    updated() {
        const control = this.form.get('label');
        this.update.emit({
            address: this.contact.address,
            label: control.value as string
        });
        this.toggleEdit();
    }

    cancel() {
        this.form.get('label').setValue(this.contact.label);
        this.toggleEdit();
        this.cancelled.emit(true);
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes.hasOwnProperty('editMode')) {
            const control = this.form.get('label');
            if (changes['editMode'].currentValue) {
                control.enable({ onlySelf: true });
            } else {
                control.disable({ onlySelf: true });
            }
        }

        if (changes.hasOwnProperty('address')) {
            this.updateLabel(changes['address']);
        }
    }

    private updateLabel(simpleChange: SimpleChange) {
        if (simpleChange.isFirstChange()) {
            return;
        }

        this.form.get('label').setValue(simpleChange.currentValue.label);
    }
}
