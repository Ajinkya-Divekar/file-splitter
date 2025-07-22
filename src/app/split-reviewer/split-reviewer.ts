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

  resData = {
    input_tokens: 1075,
    output_files: [
      {
        is_multipage: true,
        original_file_path:
          'C:/Users/ajink/OneDrive/Desktop/documents\\Mohan R_ BGV Doc.pdf',
        path: 'C:/Users/ajink/OneDrive/Desktop/documents\\Mohan R_ BGV Doc_employment-verification-form_1-2-3-4-5-6.pdf',
        start_page: 1,
      },
      {
        is_multipage: true,
        original_file_path:
          'C:/Users/ajink/OneDrive/Desktop/documents\\Mohan R_ BGV Doc.pdf',
        path: "C:/Users/ajink/OneDrive/Desktop/documents\\Mohan R_ BGV Doc_master's-degree-documents_8-9-10-11-12-13.pdf",
        start_page: 2,
      },
    ],
    output_tokens: 387,
    status: 'success',
    status_code: '200',
    total_tokens: 2157,
  };

  resSections: { start: number; end?: number; name: string }[] = [];

  applyResData() {
    // Step 1: Load snap points
    this.snap_points = this.resData.output_files.map((f) => f.start_page);

    // Step 2: Extract names from filename
    this.resSections = this.resData.output_files.map((f) => {
      const path = f.path;
      const fileName = path.split('\\').pop()?.split('/').pop() || '';
      const nameOnly = fileName.replace(/_/g, ' ').replace(/\.pdf$/, '');
      return {
        start: f.start_page,
        name: nameOnly,
      };
    });

    console.log('Loaded snap points from resData:', this.snap_points);
    console.log('Section names:', this.resSections);
  }

  snap_points = [1];
  sections: { start: number; end: number; name: string }[] = [];

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

  ngAfterViewInit(): void {
    this.applyResData();
  }

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

  onDragStart(index: number) {
    const line = this.splitLines[index];
    this.originalXMap.set(index, line.x);
  }

  onDragEnd(event: CdkDragEnd, index: number) {
    const container = this.pdfStripRef.nativeElement as HTMLElement;
    const draggedEl = event.source.element.nativeElement as HTMLElement;
    const draggedRect = draggedEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Calculate relativeX to container
    let relativeX =
      draggedRect.left - containerRect.left + container.scrollLeft;

    // Drop is invalid if outside the vertical bounds
    const outOfBounds =
      draggedRect.bottom < containerRect.top ||
      draggedRect.top > containerRect.bottom;

    const originalX = this.originalXMap.get(index) ?? this.splitLines[index].x;

    if (outOfBounds) {
      // ❌ Invalid drop → Reset position visually
      draggedEl.style.transition = 'transform 0.2s ease';
      draggedEl.style.transform = `translateX(${originalX}px)`;

      // Also reset in model
      this.splitLines[index].x = originalX;

      setTimeout(() => {
        draggedEl.style.transition = '';
        draggedEl.style.transform = '';
      }, 200);

      this.snapPointElements.forEach((el) => (el.style.visibility = 'hidden'));
      return;
    }

    // Snap to nearest valid snap point
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

    // Protect boundary: don't let leftmost go further left or rightmost go right
    const sorted = this.splitLines
      .map((l, i) => ({ x: l.x, i }))
      .sort((a, b) => a.x - b.x);
    const isLeftmost = sorted[0].i === index;
    const isRightmost = sorted[sorted.length - 1].i === index;

    if (
      (isLeftmost && nearestIndex <= originalIndex) ||
      (isRightmost && nearestIndex >= originalIndex)
    ) {
      // Snap back
      draggedEl.style.transition = 'transform 0.2s ease';
      draggedEl.style.transform = `translateX(${originalX}px)`;
      this.splitLines[index].x = originalX;
      setTimeout(() => {
        draggedEl.style.transition = '';
        draggedEl.style.transform = '';
      }, 200);

      this.snapPointElements.forEach((el) => (el.style.visibility = 'hidden'));
      return;
    }

    if (draggedLine.locked) {
      this.splitLines.splice(index, 0, { x: draggedLine.x, locked: true });
      this.splitLines[index + 1] = { x: nearest, locked: false };
    } else {
      draggedLine.x = nearest;
    }

    // Remove overlapping lines
    const min = Math.min(originalIndex, nearestIndex);
    const max = Math.max(originalIndex, nearestIndex);
    this.splitLines = this.splitLines.filter((line, i) => {
      const snapIdx = this.snapPoints.indexOf(line.x);
      if (i === index) return true;
      return snapIdx <= min || snapIdx >= max;
    });

    const overlapThreshold = 1;
    const seen = new Set<number>();
    this.splitLines = this.splitLines.filter((line) => {
      for (const sx of seen) {
        if (Math.abs(sx - line.x) <= overlapThreshold) return false;
      }
      seen.add(line.x);
      return true;
    });

    this.snapPointElements.forEach((el, i) => {
      el.style.visibility = i === nearestIndex ? 'visible' : 'hidden';
    });

    this.printSegments();
  }

  private originalXMap = new Map<number, number>();

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
        const startPage = this.pages[from];
        const endPage = this.pages[to - 1];

        // Try to find matching resSection based on startPage
        const matched = this.resSections.find((r) => r.start === startPage);
        let name = matched?.name || `Section ${i + 1}`;

        // Extract clean name
        name =
          name
            .replace(/[_\\]/g, ' ')
            .split(' ')
            .filter((part) => !/^\d+(-\d+)*$/.test(part))
            .slice(-1)[0] || `Section ${i + 1}`;

        meta.push({
          start: startPage,
          end: endPage,
          name,
        });

        segments.push(this.pages.slice(from, to));
      }
    }

    this.sections = meta;

    console.log('Split Segments:', segments);
  }
}
