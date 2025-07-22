import {
  Component,
  ElementRef,
  QueryList,
  ViewChild,
  ViewChildren,
  AfterViewInit,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { PdfViewerModule } from 'ng2-pdf-viewer';
import { DragDropModule, CdkDragEnd } from '@angular/cdk/drag-drop';

interface SplitLine {
  x: number;
  locked?: boolean;
}

@Component({
  selector: 'app-split-reviewer',
  standalone: true,
  imports: [CommonModule, PdfViewerModule, DragDropModule],
  templateUrl: './split-reviewer.html',
  styleUrls: ['./split-reviewer.css'],
})
export class SplitReviewer implements AfterViewInit, AfterViewChecked {
  pdfSrc = 'https://vadimdez.github.io/ng2-pdf-viewer/assets/pdf-test.pdf';
  pages: number[] = [];

  snap_points = [1];
  sections: { start: number; end: number }[] = [];

  @ViewChild('pdfStrip', { read: ElementRef }) pdfStripRef!: ElementRef;
  @ViewChildren('snapTarget', { read: ElementRef })
  snapTargets!: QueryList<ElementRef>;

  pdfLoaded = false;
  snapPoints: number[] = [];
  snapPointElements: HTMLElement[] = [];
  snapPointsInitialized = false;

  splitLines: SplitLine[] = [];

  onPdfLoadComplete(pdf: any): void {
    this.pages = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
    this.pdfLoaded = true;
  }

  zoomLevel = 0.75;
  getZoomMarginPercent(zoomLevel: number): string {
    const margin = 10 + (1 - zoomLevel) * 75;
    return `${margin}%`;
  }

  ngAfterViewInit(): void {}

  ngAfterViewChecked(): void {
    if (
      this.pdfLoaded &&
      !this.snapPointsInitialized &&
      this.snapTargets.length === this.pages.length + 1
    ) {
      this.snapPointsInitialized = true;

      // Allow rendering cycle to stabilize
      setTimeout(() => {
        this.calculateSnapPoints();

        // 💡 Once splitLines are set, generate segments immediately
        this.printSegments();
      }, 100);
    }
  }

  calculateSnapPoints() {
    const container = this.pdfStripRef.nativeElement as HTMLElement;
    this.snapPoints = [];
    this.snapPointElements = [];

    this.snapTargets.forEach((target) => {
      const el = target.nativeElement as HTMLElement;
      this.snapPoints.push(el.offsetLeft);
      this.snapPointElements.push(el);
      el.style.visibility = 'hidden';
    });

    const start = this.snapPoints[0];
    const end = this.snapPoints[this.snapPoints.length - 1];

    this.splitLines = [{ x: start, locked: true }];

    // Add user-defined snap points
    for (const p of this.snap_points) {
      const idx = p - 1;
      if (idx > 0 && idx < this.snapPoints.length - 1) {
        this.splitLines.push({ x: this.snapPoints[idx], locked: false });
      }
    }

    this.splitLines.push({ x: end, locked: true });
  }

  onDragEnd(event: CdkDragEnd, index: number) {
    const container = this.pdfStripRef.nativeElement as HTMLElement;
    const draggedX =
      event.source.element.nativeElement.getBoundingClientRect().left;
    const containerX = container.getBoundingClientRect().left;
    let relativeX = draggedX - containerX + container.scrollLeft;

    const maxX = container.scrollWidth - 1;
    relativeX = Math.max(0, Math.min(relativeX, maxX));

    let nearest = this.snapPoints[0];
    let minDiff = Math.abs(relativeX - nearest);
    let nearestIndex = 0;

    for (let i = 1; i < this.snapPoints.length; i++) {
      const diff = Math.abs(relativeX - this.snapPoints[i]);
      if (diff < minDiff) {
        nearest = this.snapPoints[i];
        nearestIndex = i;
        minDiff = diff;
      }
    }

    const draggedLine = this.splitLines[index];
    const originalIndex = this.snapPoints.indexOf(draggedLine.x);

    // Check: don't allow leftmost line to move left
    const sorted = this.splitLines
      .map((l, i) => ({ x: l.x, i }))
      .sort((a, b) => a.x - b.x);
    const isLeftmost = sorted[0].i === index;
    const isRightmost = sorted[sorted.length - 1].i === index;

    if (
      (isLeftmost && nearestIndex <= originalIndex) ||
      (isRightmost && nearestIndex >= originalIndex)
    ) {
      // Abort move
      this.snapPointElements.forEach((el) => (el.style.visibility = 'hidden'));
      return;
    }

    if (draggedLine.locked) {
      this.splitLines.splice(index, 0, { x: draggedLine.x, locked: true });
      this.splitLines[index + 1] = { x: nearest, locked: false };
    } else {
      draggedLine.x = nearest;
    }

    const min = Math.min(originalIndex, nearestIndex);
    const max = Math.max(originalIndex, nearestIndex);

    this.splitLines = this.splitLines.filter((line, i) => {
      const snapIdx = this.snapPoints.indexOf(line.x);
      if (i === index) return true;
      return snapIdx <= min || snapIdx >= max;
    });

    this.snapPointElements.forEach((el, i) => {
      el.style.visibility = i === nearestIndex ? 'visible' : 'hidden';
    });

    this.printSegments();
  }

  printSegments() {
    console.log('printing segments');

    const sorted = this.splitLines
      .map((s) => this.snapPoints.indexOf(s.x))
      .filter((i) => i !== -1)
      .sort((a, b) => a - b);

    const segments = [];
    const meta = [];

    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i];
      const to = sorted[i + 1];

      if (from >= 0 && to > from && to <= this.pages.length) {
        segments.push(this.pages.slice(from, to));
        meta.push({
          start: this.pages[from],
          end: this.pages[to - 1],
        });
      }
    }

    this.sections = meta;
    console.log('Split Segments:', segments);
  }
}
