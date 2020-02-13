import {
    Component,
    OnInit,
    OnDestroy,
    ViewChild,
    ElementRef,
    AfterViewInit,
    HostListener
} from '@angular/core';
import { Channel } from '../../models/channel';
import { Subscription, EMPTY } from 'rxjs';
import { ChannelPollingService } from '../../services/channel-polling.service';
import { amountToDecimal } from '../../utils/amount.converter';
import { UserToken } from '../../models/usertoken';
import {
    OpenDialogPayload,
    OpenDialogResult,
    OpenDialogComponent
} from '../open-dialog/open-dialog.component';
import { RaidenConfig } from '../../services/raiden.config';
import { RaidenService } from '../../services/raiden.service';
import { flatMap } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { Animations } from '../../animations/animations';
import { TokenPollingService } from '../../services/token-polling.service';
import { SelectedTokenService } from '../../services/selected-token.service';

@Component({
    selector: 'app-channel-list',
    templateUrl: './channel-list.component.html',
    styleUrls: ['./channel-list.component.css'],
    animations: Animations.stretchInOut
})
export class ChannelListComponent implements OnInit, OnDestroy, AfterViewInit {
    @ViewChild('channel_list', { static: true })
    private listElement: ElementRef;

    visibleChannels: Channel[] = [];
    totalChannels = 0;
    showAll = false;
    selectedToken: UserToken;
    itemsPerRow = 0;

    private channels: Channel[] = [];
    private subscription: Subscription;

    constructor(
        private channelPollingService: ChannelPollingService,
        private raidenConfig: RaidenConfig,
        private raidenService: RaidenService,
        private dialog: MatDialog,
        private tokenPollingService: TokenPollingService,
        private selectedTokenService: SelectedTokenService
    ) {}

    ngOnInit() {
        this.subscription = this.channelPollingService
            .channels()
            .subscribe((channels: Channel[]) => {
                this.channels = channels;
                this.updateVisibleChannels();
            });

        const selectedTokenSubscription = this.selectedTokenService.selectedToken$.subscribe(
            (token: UserToken) => {
                this.selectedToken = token;
                this.showAll = false;
                this.updateVisibleChannels();
            }
        );
        this.subscription.add(selectedTokenSubscription);
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }

    ngAfterViewInit() {
        this.calculateItemsPerRow();
    }

    @HostListener('window:resize', ['$event'])
    onResize() {
        this.calculateItemsPerRow();
    }

    trackByFn(index, item: Channel) {
        return `${item.token_address}_${item.partner_address}`;
    }

    toggleShowAll() {
        this.showAll = !this.showAll;
        this.updateVisibleChannels();
    }

    openChannel() {
        const rdnConfig = this.raidenConfig.config;

        const payload: OpenDialogPayload = {
            tokenAddress: this.selectedToken ? this.selectedToken.address : '',
            revealTimeout: rdnConfig.reveal_timeout,
            defaultSettleTimeout: rdnConfig.settle_timeout
        };

        const dialog = this.dialog.open(OpenDialogComponent, {
            data: payload,
            width: '360px'
        });

        dialog
            .afterClosed()
            .pipe(
                flatMap((result: OpenDialogResult) => {
                    if (!result) {
                        return EMPTY;
                    }

                    return this.raidenService.openChannel(
                        result.tokenAddress,
                        result.partnerAddress,
                        result.settleTimeout,
                        result.balance
                    );
                })
            )
            .subscribe(() => {
                this.channelPollingService.refresh();
                this.tokenPollingService.refresh();
            });
    }

    private getFilteredChannels(): Channel[] {
        return this.channels.filter(channel => {
            let matchesToken = true;
            if (this.selectedToken) {
                matchesToken =
                    channel.token_address === this.selectedToken.address;
            }
            return (
                matchesToken &&
                (channel.state === 'opened' ||
                    channel.state === 'waiting_for_open')
            );
        });
    }

    private updateVisibleChannels() {
        const filteredChannels = this.getFilteredChannels();
        this.totalChannels = filteredChannels.length;

        filteredChannels.sort((a, b) => {
            const aBalance = amountToDecimal(a.balance, a.userToken.decimals);
            const bBalance = amountToDecimal(b.balance, b.userToken.decimals);

            return bBalance.minus(aBalance).toNumber();
        });

        if (this.showAll) {
            this.visibleChannels = filteredChannels;
        } else {
            this.visibleChannels = filteredChannels.slice(0, this.itemsPerRow);
        }
    }

    private calculateItemsPerRow() {
        const listWidth = this.listElement.nativeElement.getBoundingClientRect()
            .width;
        this.itemsPerRow = Math.floor((listWidth - 213) / 229);
    }
}
