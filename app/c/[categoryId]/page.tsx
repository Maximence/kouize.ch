import { FileTextIcon, ListChecksIcon, TargetIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CategoryActions } from "@/components/category-actions";
import { FileList } from "@/components/file-list";
import { FileUploader } from "@/components/file-uploader";
import { ImageList } from "@/components/image-list";
import { QuizList } from "@/components/quiz-list";
import { Skeleton } from "@/components/ui/skeleton";
import { WeakSpots } from "@/components/weak-spots";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { plural } from "@/lib/format";
import { imageUrl, listCategoryImages, missingImages } from "@/lib/images";
import { getCategory, listFiles, listQuizzes } from "@/lib/queries";
import { weakSpots } from "@/lib/study";

export async function generateMetadata(props: PageProps<"/c/[categoryId]">): Promise<Metadata> {
  const { categoryId } = await props.params;
  const cat = await getCategory(categoryId);
  return { title: cat?.name ?? "Matière" };
}

export default function CategoryPage(props: PageProps<"/c/[categoryId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-lg" />}>
      <CategoryContent {...props} />
    </Suspense>
  );
}

async function CategoryContent(props: PageProps<"/c/[categoryId]">) {
  const { categoryId } = await props.params;
  const { tab } = await props.searchParams;
  const category = await getCategory(categoryId);
  if (!category) notFound();
  const fileRows = await listFiles(categoryId);
  const quizRows = await listQuizzes(categoryId);
  const spots = await weakSpots(categoryId);

  return (
    <div className="grid gap-6" data-full-width>
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
        <span
          className="grid size-14 shrink-0 place-items-center rounded-md text-3xl"
          style={{ backgroundColor: `${category.color}66` }}
        >
          {category.emoji}
        </span>
        <div className="min-w-0 flex-1 basis-[calc(100%-4.25rem)] sm:basis-auto">
          <h1 className="text-2xl break-words sm:text-3xl">{category.name}</h1>
          <p className="text-sm text-muted-foreground">
            {plural(fileRows.length, "fichier")} · {plural(quizRows.length, "quiz", "quiz")}
          </p>
        </div>
        <CategoryActions category={category} />
      </div>

      <Tabs defaultValue={tab === "quizzes" || tab === "weak" ? tab : "files"}>
        <TabsList>
          <TabsTrigger value="files">
            <FileTextIcon /> Fichiers
          </TabsTrigger>
          <TabsTrigger value="quizzes">
            <ListChecksIcon /> Quiz
          </TabsTrigger>
          <TabsTrigger value="weak">
            <TargetIcon /> Points faibles
          </TabsTrigger>
        </TabsList>
        <TabsContent value="files" className="grid gap-4 pt-2">
          <FileUploader categoryId={category.id} />
          <FileList categoryId={category.id} files={fileRows} />
          <ImageList
            categoryId={category.id}
            images={listCategoryImages(category.id).map((i) => ({ name: i.name, url: imageUrl(i.assetId) }))}
            missing={missingImages(category.id)}
          />
        </TabsContent>
        <TabsContent value="quizzes" className="pt-2">
          <QuizList categoryId={category.id} quizzes={quizRows} hasFiles={fileRows.length > 0} />
        </TabsContent>
        <TabsContent value="weak" className="pt-2">
          <WeakSpots spots={spots} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
