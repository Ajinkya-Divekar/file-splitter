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

    if (!this.pages.length) return;

    const totalPages = this.pages.length;

    const enriched = this.resSections.map((section, index, arr) => {
      const start = section.start;
      const end =
        index < arr.length - 1 ? arr[index + 1].start - 1 : totalPages;

      // Extract clean name — keep only last part before page range
      const rawName = section.name;
      const cleanedName = rawName
        .replace(/[_\\]/g, ' ') // Replace _ or \ with space (in case of paths)
        .split(' ')
        .filter((part) => !/^\d+(-\d+)*$/.test(part)) // Remove page range parts
        .slice(-1)[0]; // Take last non-numbery chunk

      return {
        start,
        end,
        name: cleanedName || `Section ${index + 1}`,
      };
    });

    this.sections = enriched;

    // Optional: Log each section with pages
    const segments = enriched.map(({ start, end }) =>
      this.pages.slice(start - 1, end)
    );

    console.log('Split Segments:', segments);
  }
}
