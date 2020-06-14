import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UserService } from '../../../core/database/user.service';
import { combineLatest, merge, Observable, of } from 'rxjs';
import { CharacterSearchResult, XivapiService } from '@xivapi/angular-client';
import { TeamcraftUser } from '../../../model/user/teamcraft-user';
import { debounceTime, map, shareReplay, switchMap, tap } from 'rxjs/operators';
import { AngularFireAuth } from '@angular/fire/auth';
import { AngularFireFunctions } from '@angular/fire/functions';
import { FormControl, Validators } from '@angular/forms';

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UsersComponent {

  uidFilter = new FormControl('');

  emailFilter = new FormControl('');

  servers$: Observable<string[]>;

  autoCompleteRows$: Observable<string[]>;

  selectedServer = new FormControl('', [Validators.required]);

  characterName = new FormControl('');

  lodestoneId = new FormControl(null);

  loadingResults = false;

  results$: Observable<TeamcraftUser[]>;

  constructor(private userService: UserService, private xivapi: XivapiService,
              private angularFireAuth: AngularFireAuth, private gcf: AngularFireFunctions) {

    // From UID
    const usersFromUid$ = this.uidFilter.valueChanges.pipe(
      tap(() => this.loadingResults = true),
      switchMap(uid => {
        return this.userService.get(uid);
      }),
      map(user => [user].filter(u => !u.notFound)),
      tap(() => this.loadingResults = false)
    );

    // From Email
    const usersFromEmail$ = this.emailFilter.valueChanges.pipe(
      tap(() => this.loadingResults = true),
      switchMap(email => {
        return this.gcf.httpsCallable('getUserByEmail')({ email: email });
      }),
      switchMap(res => {
        if (!res.record) {
          return of({ notFound: true });
        }
        return this.userService.get(res.record.uid);
      }),
      map(user => [user].filter(u => !u.notFound)),
      tap(() => this.loadingResults = false)
    );

    // From char name
    this.servers$ = this.xivapi.getServerList().pipe(shareReplay(1));

    this.autoCompleteRows$ = combineLatest([this.servers$, this.selectedServer.valueChanges])
      .pipe(
        map(([servers, inputValue]) => {
          return servers.filter(server => server.toLowerCase().indexOf(inputValue.toLowerCase()) > -1);
        })
      );

    const usersFromCharName$ = combineLatest([this.selectedServer.valueChanges, this.characterName.valueChanges])
      .pipe(
        tap(() => this.loadingResults = true),
        debounceTime(500),
        switchMap(([selectedServer, characterName]) => {
          return this.xivapi.searchCharacter(characterName, selectedServer);
        }),
        map((result: CharacterSearchResult) => result.Results || []),
        switchMap(results => {
          if (results.length === 0) {
            return of([]);
          }
          return combineLatest(
            results.map(c => {
              return this.userService.getUsersByLodestoneId(c.ID);
            })
          ).pipe(map(res => [].concat.apply([], ...res)));
        }),
        tap(() => this.loadingResults = false)
      );

    // From lodestone ID
    const usersFromLodestoneID$ = this.lodestoneId.valueChanges.pipe(
      tap(() => this.loadingResults = true),
      switchMap(lodestoneId => this.userService.getUsersByLodestoneId(lodestoneId)),
      tap(() => this.loadingResults = false)
    );

    this.results$ = merge(
      usersFromUid$,
      usersFromEmail$,
      usersFromCharName$,
      usersFromLodestoneID$
    );
  }

}
