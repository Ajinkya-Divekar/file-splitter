import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SplitReviewer } from './split-reviewer';

describe('SplitReviewer', () => {
  let component: SplitReviewer;
  let fixture: ComponentFixture<SplitReviewer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SplitReviewer]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SplitReviewer);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
