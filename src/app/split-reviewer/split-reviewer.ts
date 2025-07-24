import {
  Component,
  ElementRef,
  QueryList,
  ViewChild,
  ViewChildren,
  AfterViewInit,
  AfterViewChecked,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { PdfViewerModule } from 'ng2-pdf-viewer';
import { DragDropModule, CdkDragEnd } from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import samplePdf from '../../assets/documents/Mohan R_ BGV Doc.pdf';

interface SplitLine {
  x: number;
  locked?: boolean;
}

@Component({
  selector: 'app-split-reviewer',
  standalone: true,
  imports: [
    CommonModule,
    PdfViewerModule,
    DragDropModule,
    FormsModule,
    HttpClientModule,
  ],
  templateUrl: './split-reviewer.html',
  styleUrls: ['./split-reviewer.css'],
})
export class SplitReviewer implements OnInit, AfterViewInit, AfterViewChecked {
  @ViewChild('pdfStrip', { read: ElementRef }) pdfStripRef!: ElementRef;
  @ViewChildren('snapTarget', { read: ElementRef })
  snapTargets!: QueryList<ElementRef>;

  focusedPageIndex: number | null = null;
  baseZoom: number = 0.9;
  focusedZoom: number = 0.95;

  adjustFocusedZoom(delta: number) {
    if (this.focusedPageIndex === null) return;
    this.focusedZoom = Math.min(Math.max(this.focusedZoom + delta, 0.25), 2);
  }

  // New: Jump to the given page in the PDF strip viewer
  jumpToSectionPage(pageNumber: number, index: number): void {
    const pageIndex = this.pages.indexOf(pageNumber);
    if (pageIndex === -1) {
      console.warn(`Page number ${pageNumber} not found.`);
      return;
    }

    const snapTargetsArray = this.snapTargets.toArray();
    if (pageIndex < 0 || pageIndex >= snapTargetsArray.length) {
      console.warn(`Invalid snap target.`);
      return;
    }

    const targetElement = snapTargetsArray[pageIndex]
      .nativeElement as HTMLElement;

    if (!targetElement) {
      console.warn('Target DOM element not found.');
      return;
    }

    // Smoothly scroll so this page is visible and centered horizontally
    targetElement.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });

    // Update focused visuals and zoom
    this.focusedZoom = this.baseZoom; // Adjust as needed

    this.toggleSection(index);
  }

  toggleFocus(i: number) {
    if (this.focusedPageIndex === i) {
      this.focusedPageIndex = null; // Unfocus if same page clicked
    } else {
      this.focusedPageIndex = i; // Focus new page
    }
  }

  pdfLoaded = false;
  snapPoints: number[] = [];
  snapPointElements: HTMLElement[] = [];
  snapPointsInitialized = false;
  splitLines: SplitLine[] = [];
  originalXMap = new Map<number, number>();
  pages: number[] = [];

  pdfSrc = samplePdf; // ✅ Recommend relative path
  zoomLevel = 0.95;

  tempResData: any = null;
  resSections: { start: number; end: number; name: string }[] = [];
  sections: { start: number; end: number; name: string }[] = [];
  expandedSections: Set<number> = new Set();
  isLoading = false;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.sendFolderPath('../../assets/documents');
  }

  onPdfLoadComplete(pdf: any): void {
    this.pages = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
    this.pdfLoaded = true;
  }

  ngAfterViewInit(): void {
    // No-op, wait for ViewChecked
  }

  ngAfterViewChecked(): void {
    if (this.pdfLoaded && this.tempResData && !this.snapPointsInitialized) {
      this.snapPointsInitialized = true;
      setTimeout(() => {
        this.applyResData();
        this.calculateSnapPoints();
        this.printSegments();
      });
    }
  }

  sendFolderPath(folderPath: string) {
    this.isLoading = true;
    const payload = { folder_path: folderPath };

    this.http.post('http://localhost:5000/process', payload).subscribe({
      next: (response: any) => {
        this.tempResData = response;
        this.isLoading = false;
      },
      error: (err) => {
        this.isLoading = false;
        console.error('API Error:', err);
      },
    });
  }

  applyResData() {
    this.resSections = this.tempResData.output_files.map((f: any) => {
      const fileName =
        f.path
          .split(/[\\/]/)
          .pop()
          ?.replace(/\.pdf$/, '') || '';
      const pageStart = f.start_page;
      const pageEnd = f.is_multipage ? f.end_page : pageStart;

      const cleanedName = fileName
        .replace(/(_|\s)\d+([-_\d]*)$/, '')
        .split(/[_\s]+/)
        .filter(
          (p: any) => !['mohan', 'r', 'bgv', 'doc'].includes(p.toLowerCase())
        )
        .join('-');

      return {
        start: pageStart,
        end: pageEnd,
        name: cleanedName || `Section`,
      };
    });

    // Extract snapPoints from starting page of each section
    this.snapPoints = this.resSections.map((x) => x.start);
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

    const uniqueSnapX = new Set<number>();
    for (const section of this.resSections) {
      const idx = section.start - 1;
      if (idx > 0 && idx < this.snapPoints.length - 1) {
        const pos = this.snapPoints[idx];
        if (!uniqueSnapX.has(pos)) {
          this.splitLines.push({ x: pos, locked: false });
          uniqueSnapX.add(pos);
        }
      }
    }

    this.splitLines.push({ x: end, locked: true });
  }

  onSectionPageChange(index: number, key: 'start' | 'end', value: number) {
    if (value < 1 || value > this.pages.length) return;

    this.resSections[index][key] = value;

    const positions = this.resSections.map((s) => s.start);
    const uniqueSnapX = new Set<number>();
    this.splitLines = [];

    positions.forEach((page) => {
      const snapEl = this.snapTargets.toArray()[page - 1];
      if (!snapEl) return;
      const snapX = snapEl.nativeElement.offsetLeft;

      if (!uniqueSnapX.has(snapX)) {
        uniqueSnapX.add(snapX);
        this.splitLines.push({ x: snapX, locked: false });
      }
    }); // Add locked boundaries

    const snapEls = this.snapTargets.toArray();
    const startX = snapEls[0]?.nativeElement.offsetLeft;
    const endX = snapEls.at(-1)?.nativeElement.offsetLeft;
    if (typeof startX === 'number')
      this.splitLines.push({ x: startX, locked: true });
    if (typeof endX === 'number')
      this.splitLines.push({ x: endX, locked: true }); // Remove duplicates and sort

    this.splitLines = this.splitLines
      .filter((v, i, arr) => i === arr.findIndex((l) => l.x === v.x))
      .sort((a, b) => a.x - b.x);

    this.printSegments();
  }

  onDragStart(index: number): void {
    this.originalXMap.set(index, this.splitLines[index].x);
  }

  onDragEnd(event: CdkDragEnd, index: number): void {
    const container = this.pdfStripRef.nativeElement as HTMLElement;
    const draggedEl = event.source.element.nativeElement as HTMLElement;
    const draggedRect = draggedEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const relativeX =
      draggedRect.left - containerRect.left + container.scrollLeft;
    const draggedLine = this.splitLines[index];
    const originalX = this.originalXMap.get(index) ?? draggedLine.x;

    // Snap to nearest
    let nearest = this.snapPoints[0];
    let nearestIndex = 0;
    let minDiff = Infinity;

    this.snapPoints.forEach((pt, i) => {
      const diff = Math.abs(relativeX - pt);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = pt;
        nearestIndex = i;
      }
    });

    // Prevent dragging too far (preserve locked bounds)
    const isCrossed = (a: number, b: number) => {
      const min = Math.min(a, b);
      const max = Math.max(a, b);
      return (x: number) => x > min && x < max;
    };

    const crossed = isCrossed(originalX, nearest);

    // Remove crossed and duplicates (excluding locked)
    this.splitLines = this.splitLines.filter((line, i) => {
      if (i === index) return true;
      return !(crossed(line.x) || (line.x === nearest && !line.locked));
    });

    if (draggedLine.locked) {
      // Clone locked, make draggable editable version
      this.splitLines.splice(index, 0, { x: draggedLine.x, locked: true });
      this.splitLines[index + 1] = { x: nearest, locked: false };
    } else {
      draggedLine.x = nearest;
    }

    // Remove overlapping editable lines (within overlap threshold)
    const seen = new Set<number>();
    const overlap = 1;
    const editable = this.splitLines.filter((l) => !l.locked);
    const locked = this.splitLines.filter((l) => l.locked);

    const filtered = editable.filter((line) => {
      for (const s of seen) {
        if (Math.abs(s - line.x) <= overlap) return false;
      }
      seen.add(line.x);
      return true;
    });

    this.splitLines = [...locked, ...filtered].sort((a, b) => a.x - b.x);

    // Snap visual
    this.snapPointElements.forEach((el, i) => {
      el.style.visibility = i === nearestIndex ? 'visible' : 'hidden';
    });

    this.printSegments();
  }

  printSegments() {
    const sortedIndexes = this.splitLines
      .map((line) => this.snapPoints.indexOf(line.x))
      .filter((i) => i !== -1)
      .sort((a, b) => a - b);

    const result: { start: number; end: number; name: string }[] = [];

    for (let i = 0; i < sortedIndexes.length - 1; i++) {
      const fromIdx = sortedIndexes[i];
      const toIdx = sortedIndexes[i + 1];

      const start = this.pages[fromIdx];
      const end = this.pages[toIdx - 1];

      const match = this.resSections.find((s) => s.start === start);
      let name = match?.name || `Section ${i + 1}`;
      name =
        name
          .replace(/[_\\]/g, ' ')
          .split(' ')
          .filter((part) => !/^\d+(-\d+)*$/.test(part))
          .slice(-1)[0] || `Section ${i + 1}`;

      result.push({ start, end, name });
    }

    this.resSections = result;
    console.log('Split Segments:', this.resSections);
  }

  // Section Editing Logic (Optional)
  editingIndex: number | null = null;

  enableEdit(index: number, event: MouseEvent) {
    event.stopPropagation();
    this.editingIndex = index;
  }

  disableEdit(index: number) {
    this.editingIndex = null;
  }

  get sectionNames(): string[] {
    return this.resSections.map((s) => s.name);
  }

  get sectionStartPages(): number[] {
    return this.resSections.map((s) => s.start);
  }

  get sectionEndPages(): number[] {
    return this.resSections.map((s) => s.end);
  }

  onSaveSplit() {
    const original_file_path =
      'C:/Users/ajink/OneDrive/Desktop/file-splitter/src/assets/documents/Mohan R_ BGV Doc.pdf';
    const sectionNames = this.sectionNames;
    const startPages = this.sectionStartPages;
    const endPages = this.sectionEndPages;

    const cuts = sectionNames.map((name, index) => ({
      start_page: startPages[index],
      end_page: endPages[index],
      pdf_name: name,
      is_modify: true,
    }));

    const old_file_paths = this.tempResData.output_files.map(
      (f: any) => f.path
    );

    const finalPayload = {
      final_paths: [
        {
          original_file_path,
          cuts,
          old_file_paths,
        },
      ],
    };

    // 🔥 Send API request
    this.http.post('http://localhost:5000/cut_pdf', finalPayload).subscribe({
      next: (response: any) => {
        console.log('✅ PDF split success:', response);
        alert('✅PDF split success!');
      },
      error: (err) => {
        console.error('❌ Error while splitting PDF:', err);
      },
    });
  }

  toggleSection(i: number) {
    // 🔒 Lock toggle while any editing is active
    if (this.editingIndex !== null) return;

    this.expandedSections.has(i)
      ? this.expandedSections.delete(i)
      : this.expandedSections.add(i);
  }

  isExpanded(i: number) {
    return this.expandedSections.has(i);
  }

  adjustZoom(change: number) {
    const newZoom = this.zoomLevel + change;
    this.zoomLevel = Math.min(0.95, Math.max(0.25, newZoom));
  }

  getZoomMarginPercent(zoomLevel: number): string {
    const margin = 10 + (1 - zoomLevel) * 75;
    return `${margin}%`;
  }
}
