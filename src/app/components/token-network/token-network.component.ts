import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { PageEvent } from '@angular/material/paginator';
import { EMPTY, Observable, Subscription } from 'rxjs';
import { flatMap, finalize } from 'rxjs/operators';
import { SortingData } from '../../models/sorting.data';
import { UserToken } from '../../models/usertoken';
import { RaidenService } from '../../services/raiden.service';
import {
    amountToDecimal,
    amountFromDecimal
} from '../../utils/amount.converter';
import { StringUtils } from '../../utils/string.utils';
import { TokenUtils } from '../../utils/token.utils';
import {
    ConfirmationDialogComponent,
    ConfirmationDialogPayload
} from '../confirmation-dialog/confirmation-dialog.component';
import {
    ConnectionManagerDialogComponent,
    ConnectionManagerDialogPayload
} from '../connection-manager-dialog/connection-manager-dialog.component';
import {
    PaymentDialogComponent,
    PaymentDialogPayload
} from '../payment-dialog/payment-dialog.component';
import { RegisterDialogComponent } from '../register-dialog/register-dialog.component';
import { TokenSorting } from './token.sorting.enum';
import { PageBaseComponent } from '../page/page-base/page-base.component';
import { TokenNetworkActionsComponent } from '../token-network-actions/token-network-actions.component';
import { Network } from '../../utils/network-info';
import BigNumber from 'bignumber.js';
import { PendingTransferPollingService } from '../../services/pending-transfer-polling.service';
import { TokenPollingService } from '../../services/token-polling.service';

@Component({
    selector: 'app-token-network',
    templateUrl: './token-network.component.html',
    styleUrls: ['./token-network.component.scss']
})
export class TokenNetworkComponent implements OnInit, OnDestroy {
    @ViewChild(PageBaseComponent, { static: true })
    page: PageBaseComponent;

    refreshing$: Observable<boolean>;

    currentPage = 0;
    pageSize = 10;
    readonly pageSizeOptions: number[] = [5, 10, 25, 50, 100];
    visibleTokens: Array<UserToken> = [];
    tokens: Array<UserToken> = [];
    totalTokens = 0;
    sorting = TokenSorting.Connected;
    ascending = false;
    filter = '';
    readonly network$: Observable<Network>;

    readonly sortingOptions: SortingData[] = [
        {
            value: TokenSorting.Balance,
            label: 'Balance'
        },
        {
            value: TokenSorting.Symbol,
            label: 'Symbol'
        },
        {
            value: TokenSorting.Address,
            label: 'Address'
        },
        {
            value: TokenSorting.Name,
            label: 'Name'
        },
        {
            value: TokenSorting.Connected,
            label: 'Connected'
        }
    ];

    private subscription: Subscription;

    constructor(
        public dialog: MatDialog,
        private raidenService: RaidenService,
        private pendingTransferPollingService: PendingTransferPollingService,
        private tokenPollingService: TokenPollingService
    ) {
        this.network$ = raidenService.network$;
        this.refreshing$ = this.tokenPollingService.refreshing();
    }

    public get production(): boolean {
        return this.raidenService.production;
    }

    showRegisterDialog() {
        const registerDialogRef = this.dialog.open(RegisterDialogComponent, {
            width: '360px'
        });

        registerDialogRef
            .afterClosed()
            .pipe(
                flatMap((tokenAddress: string) => {
                    if (tokenAddress) {
                        return this.raidenService.registerToken(tokenAddress);
                    } else {
                        return EMPTY;
                    }
                })
            )
            .subscribe(() => {
                this.refreshTokens();
            });
    }

    // noinspection JSMethodCanBeStatic
    trackByFn(index, item: UserToken) {
        return item.address;
    }

    ngOnInit() {
        this.subscription = this.tokenPollingService.tokens$.subscribe(
            (tokens: Array<UserToken>) => {
                this.tokens = tokens;
                this.totalTokens = tokens.length;
                this.applyFilters();
            }
        );
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }

    public showConnectionManagerDialog(
        userToken: UserToken,
        join: boolean = true
    ) {
        const payload: ConnectionManagerDialogPayload = {
            tokenAddress: userToken.address,
            funds: new BigNumber(0),
            decimals: userToken.decimals,
            join: join
        };

        const joinDialogRef = this.dialog.open(
            ConnectionManagerDialogComponent,
            {
                data: payload,
                width: '360px'
            }
        );

        joinDialogRef
            .afterClosed()
            .pipe(
                flatMap((result: ConnectionManagerDialogPayload) => {
                    if (result) {
                        return this.raidenService.connectTokenNetwork(
                            result.funds,
                            result.tokenAddress,
                            result.join
                        );
                    } else {
                        return EMPTY;
                    }
                })
            )
            .subscribe(() => {
                this.refreshTokens();
            });
    }

    public showPaymentDialog(userToken: UserToken) {
        const payload: PaymentDialogPayload = {
            tokenAddress: userToken.address,
            targetAddress: '',
            amount: new BigNumber(0),
            paymentIdentifier: null
        };

        const paymentDialogRef = this.dialog.open(PaymentDialogComponent, {
            data: payload,
            width: '360px'
        });

        paymentDialogRef
            .afterClosed()
            .pipe(
                flatMap((result: PaymentDialogPayload) => {
                    if (result) {
                        return this.raidenService.initiatePayment(
                            result.tokenAddress,
                            result.targetAddress,
                            result.amount,
                            result.paymentIdentifier
                        );
                    } else {
                        return EMPTY;
                    }
                })
            )
            .subscribe(() => {
                this.refreshTokens();
                this.pendingTransferPollingService.refresh();
            });
    }

    public showLeaveDialog(userToken: UserToken) {
        const payload: ConfirmationDialogPayload = {
            title: 'Leave Token Network',
            message: `Are you sure that you want to close and settle all channels for token
            <p><strong>${userToken.name} <${userToken.address}></strong>?</p>`
        };

        const dialog = this.dialog.open(ConfirmationDialogComponent, {
            data: payload,
            width: '360px'
        });

        dialog
            .afterClosed()
            .pipe(
                flatMap(result => {
                    if (!result) {
                        return EMPTY;
                    }

                    return this.raidenService.leaveTokenNetwork(userToken);
                })
            )
            .subscribe(() => {
                this.refreshTokens();
            });
    }

    onPageEvent(event: PageEvent) {
        this.currentPage = event.pageIndex;
        this.pageSize = event.pageSize;
        this.applyFilters();
    }

    changeSorting(sorting: TokenSorting) {
        this.sorting = sorting;
        this.applyFilters();
    }

    applyFilters() {
        const userTokens: Array<UserToken> = this.tokens;
        let compareFn: (a: UserToken, b: UserToken) => number;

        switch (this.sorting) {
            case TokenSorting.Name:
                compareFn = (a, b) =>
                    StringUtils.compare(this.ascending, a.name, b.name);
                break;
            case TokenSorting.Symbol:
                compareFn = (a, b) =>
                    StringUtils.compare(this.ascending, a.symbol, b.symbol);
                break;
            case TokenSorting.Address:
                compareFn = (a, b) =>
                    StringUtils.compare(this.ascending, a.address, b.address);
                break;
            case TokenSorting.Balance:
                compareFn = (a, b) => {
                    const aBalance = amountToDecimal(a.balance, a.decimals);
                    const bBalance = amountToDecimal(b.balance, b.decimals);
                    return this.ascending
                        ? aBalance.minus(bBalance).toNumber()
                        : bBalance.minus(aBalance).toNumber();
                };
                break;
            default:
                compareFn = (a, b) =>
                    this.ascending
                        ? TokenUtils.compareTokens(a, b) * -1
                        : TokenUtils.compareTokens(a, b);
                break;
        }

        const start = this.pageSize * this.currentPage;

        const filteredTokens = userTokens.filter((value: UserToken) =>
            this.searchFilter(value)
        );

        this.totalTokens = this.filter
            ? filteredTokens.length
            : this.tokens.length;

        this.visibleTokens = filteredTokens
            .sort(compareFn)
            .slice(start, start + this.pageSize);
    }

    changeOrder() {
        this.ascending = !this.ascending;
        this.applyFilters();
    }

    applyKeywordFilter() {
        this.applyFilters();
        this.page.firstPage();
    }

    clearFilter() {
        this.filter = '';
        this.applyFilters();
        this.page.firstPage();
    }

    mintToken(token: UserToken, component: TokenNetworkActionsComponent) {
        component.requestingTokens = true;
        const decimals = token.decimals;
        const scaleFactor = decimals >= 18 ? 1 : decimals / 18;
        const amount = amountFromDecimal(new BigNumber(0.01), decimals)
            .times(scaleFactor)
            .plus(
                amountFromDecimal(new BigNumber(1000), decimals).times(
                    1 - scaleFactor
                )
            )
            .integerValue();
        const finishRequest = () => (component.requestingTokens = false);
        this.raidenService
            .mintToken(token, this.raidenService.raidenAddress, amount)
            .pipe(finalize(finishRequest))
            .subscribe(() => this.refreshTokens());
    }

    private refreshTokens() {
        this.tokenPollingService.refresh();
    }

    private searchFilter(token: UserToken): boolean {
        const searchString = this.filter.toLocaleLowerCase();
        const tokenName = token.name.toLocaleLowerCase();
        const tokenSymbol = token.symbol.toLocaleLowerCase();
        return (
            tokenName.startsWith(searchString) ||
            tokenSymbol.startsWith(searchString)
        );
    }
}
