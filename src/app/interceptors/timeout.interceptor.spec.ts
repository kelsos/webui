import { TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import {
    HttpClientTestingModule,
    HttpTestingController,
} from '@angular/common/http/testing';
import { HTTP_INTERCEPTORS, HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { TimeoutInterceptor } from './timeout.interceptor';
import { TestProviders } from '../../testing/test-providers';
import { RaidenConfig } from '../services/raiden.config';

@Injectable()
class MockRequestingService {
    constructor(private http: HttpClient) {}

    request(): Observable<any> {
        return this.http.get('someurl.com/data');
    }
}

describe('TimeoutInterceptor', () => {
    let service: MockRequestingService;
    let httpMock: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [
                MockRequestingService,
                {
                    provide: HTTP_INTERCEPTORS,
                    useClass: TimeoutInterceptor,
                    deps: [RaidenConfig],
                    multi: true,
                },
                TestProviders.MockRaidenConfigProvider(),
            ],
        });

        service = TestBed.inject(MockRequestingService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    it('should throw an error if a timeout occurs', fakeAsync(() => {
        service.request().subscribe(
            () => {
                fail('On next should not be called');
            },
            (error) => {
                expect(error).toBeTruthy('An error was expected');
            }
        );
        tick(600000);

        httpMock.expectOne({
            url: 'someurl.com/data',
            method: 'GET',
        });

        flush();
    }));
});
