import React from 'react'
import { Button } from '@/components/ui/button'

const CategoryFilter = ({ categories, selectedCategory, onSelectCategory }) => {
  return (
    <div className="pb-2 overflow-x-auto md:overflow-visible scrollbar-hide">
      <div className="flex gap-2 md:flex-wrap md:gap-2 md:space-x-0">
        {categories.map((category, index) => (
          <Button
            key={index}
            variant={selectedCategory === category ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSelectCategory(category)}
            className={`whitespace-nowrap transition-colors duration-200 ${
              selectedCategory === category
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'border-border/70 text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            {category}
          </Button>
        ))}
      </div>
    </div>
  )
}

export default CategoryFilter
